import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { type Section, TERM_LABELS, type TermNumber } from '../../../shared/constants/academics'
import type { PAYMENT_METHODS } from '../../../shared/schemas/fees'
import { billBalance, carryForwardLine, formatReceiptNumber } from '../../../shared/utils/fees'
import {
  academicSessions,
  billLines,
  bills,
  classArms,
  classLevels,
  discounts,
  feeItems,
  payments,
  receiptCounters,
  studentEnrolments,
  students,
  terms,
  users,
} from '../schema'
import type { Db } from '../../utils/db'

type Method = typeof PAYMENT_METHODS[number]
type DemoItem = { name: string, naira: number, optional?: boolean }

export interface DemoFees {
  /** Current-term fee items per section, applied to every class level of that section */
  items: Partial<Record<Section, DemoItem[]>>
  /** An earlier term with bills for some students of an arm, so arrears/credit carry forward */
  earlier?: { session: string, term: TermNumber, level: string, arm: string, items: DemoItem[], students: { index: number, paidNaira: number }[] }
  /** Payments in one arm, by student index (admission number order) */
  payments?: {
    arm: string
    plan: { index: number, amount: number | 'full' | 'over', method: Method, reversed?: string }[]
    discount?: { index: number, percent: number, reason: string }
  }
  /** Email of the staff member who "received" the demo payments */
  bursar: string
}

const naira = (n: number) => Math.round(n * 100)

/**
 * Idempotent demo fees: fee items for the current term, a bill for every active enrolled student (with
 * carry-forward from the earlier demo bills), a discount and payments with fixed receipt numbers.
 */
export async function seedFees(db: Db, schoolId: string, sessionId: string, demo: DemoFees) {
  const [term] = await db.select().from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true)))
  if (!term) return
  const [session] = await db.select({ name: academicSessions.name }).from(academicSessions).where(eq(academicSessions.id, sessionId))
  const year = Number(session!.name.slice(0, 4))
  const [bursar] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, demo.bursar)))
  const levels = await db.select().from(classLevels).where(eq(classLevels.schoolId, schoolId))
  const arms = await db.select({ id: classArms.id, arm: classArms.name, levelId: classLevels.id, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))
  const armOf = (label: string) => arms.find(a => `${a.level}${a.arm}` === label || `${a.level} ${a.arm}` === label)!
  const roster = (armId: string) => db.select({ id: students.id }).from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(and(eq(studentEnrolments.schoolId, schoolId), eq(studentEnrolments.sessionId, sessionId), eq(studentEnrolments.classArmId, armId), isNull(students.deletedAt)))
    .orderBy(asc(students.admissionNumber))

  /** All of a level's items in one statement; returns every item the level has in the term. */
  const upsertItems = async (termId: string, levelId: string, items: DemoItem[]) => {
    if (items.length) {
      await db.insert(feeItems)
        .values(items.map((item, i) => ({ schoolId, termId, classLevelId: levelId, name: item.name, amountKobo: naira(item.naira), optional: !!item.optional, sortOrder: i })))
        .onConflictDoUpdate({
          target: [feeItems.schoolId, feeItems.termId, feeItems.classLevelId, feeItems.name],
          set: { amountKobo: sql`excluded.amount_kobo`, optional: sql`excluded.optional`, sortOrder: sql`excluded.sort_order` },
        })
    }
    return db.select().from(feeItems).where(and(eq(feeItems.schoolId, schoolId), eq(feeItems.termId, termId), eq(feeItems.classLevelId, levelId))).orderBy(asc(feeItems.sortOrder))
  }
  const upsertBill = async (termId: string, studentId: string, levelId: string, armId: string, lines: { feeItemId: string | null, kind: 'item' | 'carry_forward', description: string, amountKobo: number }[]) => {
    const [bill] = await db.insert(bills).values({ schoolId, termId, studentId, classLevelId: levelId, classArmId: armId, generatedById: bursar?.id })
      .onConflictDoUpdate({ target: [bills.schoolId, bills.termId, bills.studentId], set: { classLevelId: levelId, classArmId: armId } })
      .returning({ id: bills.id })
    // Rebuilt on every run: the demo bill is exactly the demo items
    await db.delete(billLines).where(eq(billLines.billId, bill!.id))
    if (lines.length) await db.insert(billLines).values(lines.map(l => ({ ...l, schoolId, billId: bill!.id })))
    return bill!.id
  }
  let receipt = 0
  const pay = async (billId: string, studentId: string, amountKobo: number, method: Method, paidOn: string, reversed?: string) => {
    receipt++
    await db.insert(payments).values({
      schoolId, billId, studentId, amountKobo, method, paidOn, receiptNumber: formatReceiptNumber(year, receipt), receivedById: bursar?.id,
      reference: method === 'cash' ? null : `DEMO-${receipt}`,
      ...(reversed ? { reversedAt: new Date(`${paidOn}T15:00:00+01:00`), reversedById: bursar?.id, reversalReason: reversed } : {}),
    }).onConflictDoNothing()
  }
  /** The bill's balance; `due` ignores payments, so re-runs work out the same demo amounts. */
  const balanceOf = async (billId: string, { due = false } = {}) => {
    const lines = await db.select().from(billLines).where(eq(billLines.billId, billId))
    const rules = await db.select().from(discounts).where(eq(discounts.billId, billId))
    const paid = due ? [] : await db.select().from(payments).where(eq(payments.billId, billId))
    return billBalance({ lines, discounts: rules, payments: paid.map(p => ({ amountKobo: p.amountKobo, reversed: !!p.reversedAt })) }).balance
  }

  // An earlier term's bills (and payments), whose balances carry forward
  const carried = new Map<string, number>()
  if (demo.earlier) {
    const [earlierTerm] = await db.select({ id: terms.id, startsOn: terms.startsOn }).from(terms)
      .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
      .where(and(eq(terms.schoolId, schoolId), eq(academicSessions.name, demo.earlier.session), eq(terms.number, demo.earlier.term)))
    const level = levels.find(l => l.name === demo.earlier!.level)!
    const arm = armOf(demo.earlier.arm)
    const items = await upsertItems(earlierTerm!.id, level.id, demo.earlier.items)
    const list = await roster(arm.id)
    for (const { index, paidNaira } of demo.earlier.students) {
      const student = list[index]!
      const billId = await upsertBill(earlierTerm!.id, student.id, level.id, arm.id, items.map(i => ({ feeItemId: i.id, kind: 'item' as const, description: i.name, amountKobo: i.amountKobo })))
      await pay(billId, student.id, naira(paidNaira), 'transfer', earlierTerm!.startsOn ?? '2026-05-04')
      carried.set(student.id, await balanceOf(billId))
    }
  }

  // Current term: items for every level, a bill for every active enrolled student
  const earlierLabel = demo.earlier ? `${TERM_LABELS[demo.earlier.term]} ${demo.earlier.session}` : ''
  const billOf = new Map<string, string>()
  const enrolled = await db.select({ studentId: students.id, armId: studentEnrolments.classArmId }).from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(and(eq(studentEnrolments.schoolId, schoolId), eq(studentEnrolments.sessionId, sessionId), isNull(students.deletedAt)))
  const levelOfArm = new Map(arms.map(a => [a.id, a.levelId]))
  const compulsoryOf = new Map<string, Awaited<ReturnType<typeof upsertItems>>>()
  for (const level of levels) compulsoryOf.set(level.id, (await upsertItems(term.id, level.id, demo.items[level.section] ?? [])).filter(i => !i.optional))
  // Every bill in one statement, then all their lines (rebuilt on each run)
  if (enrolled.length) {
    const rows = await db.insert(bills)
      .values(enrolled.map(e => ({ schoolId, termId: term.id, studentId: e.studentId, classLevelId: levelOfArm.get(e.armId)!, classArmId: e.armId, generatedById: bursar?.id })))
      .onConflictDoUpdate({ target: [bills.schoolId, bills.termId, bills.studentId], set: { classLevelId: sql`excluded.class_level_id`, classArmId: sql`excluded.class_arm_id` } })
      .returning({ id: bills.id, studentId: bills.studentId, levelId: bills.classLevelId })
    await db.delete(billLines).where(inArray(billLines.billId, rows.map(r => r.id)))
    const lines = rows.flatMap((bill) => {
      billOf.set(bill.studentId, bill.id)
      const carry = carryForwardLine(carried.get(bill.studentId) ?? 0, earlierLabel)
      return [
        ...(compulsoryOf.get(bill.levelId) ?? []).map(i => ({ schoolId, billId: bill.id, feeItemId: i.id, kind: 'item' as const, description: i.name, amountKobo: i.amountKobo })),
        ...(carry ? [{ schoolId, billId: bill.id, feeItemId: null, ...carry }] : []),
      ]
    })
    if (lines.length) await db.insert(billLines).values(lines)
  }

  if (demo.payments) {
    const list = await roster(armOf(demo.payments.arm).id)
    if (demo.payments.discount) {
      const student = list[demo.payments.discount.index]!
      const billId = billOf.get(student.id)!
      await db.delete(discounts).where(and(eq(discounts.billId, billId), eq(discounts.reason, demo.payments.discount.reason)))
      await db.insert(discounts).values({ schoolId, billId, kind: 'percent', value: Math.round(demo.payments.discount.percent * 100), reason: demo.payments.discount.reason, createdById: bursar?.id })
    }
    for (const [n, step] of demo.payments.plan.entries()) {
      const student = list[step.index]!
      const billId = billOf.get(student.id)!
      const due = await balanceOf(billId, { due: true })
      const amount = step.amount === 'full' ? due : step.amount === 'over' ? due + naira(5000) : naira(step.amount)
      if (amount <= 0) {
        // Keep the receipt numbers of later demo payments stable
        receipt++
        continue
      }
      const day = String(15 + (n % 14)).padStart(2, '0')
      await pay(billId, student.id, amount, step.method, `${term.startsOn?.slice(0, 8) ?? '2026-09-'}${day}`, step.reversed)
    }
  }

  await db.insert(receiptCounters).values({ schoolId, year, lastNumber: receipt })
    .onConflictDoUpdate({ target: [receiptCounters.schoolId, receiptCounters.year], set: { lastNumber: sql`greatest(${receiptCounters.lastNumber}, excluded.last_number)` } })
}
