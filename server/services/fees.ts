import { asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { SECTIONS, TERM_LABELS, TERM_NUMBERS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import { classArmLabel } from '../../shared/utils/academics'
import { billBalance, carryForwardLine, discountAmounts, type DiscountRule } from '../../shared/utils/fees'
import {
  academicSessions,
  billLines,
  bills,
  classArms,
  classLevels,
  discounts,
  feeItems,
  payments,
  studentEnrolments,
  students,
  terms,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { resolveTerm } from './terms'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }
type Term = Awaited<ReturnType<typeof resolveTerm>>

export const BILLS_PAGE_SIZE = 25

/** Whether the class level has fee items or bills (any term): deleting it would lose them. */
export async function levelHasFees(db: Db, school: SchoolRef, levelId: string) {
  const [item] = await db.select({ id: feeItems.id }).from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.classLevelId, levelId))).limit(1)
  if (item) return true
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, eq(bills.classLevelId, levelId))).limit(1)
  return !!bill
}

/** Whether any bill was raised for the arm (any term). */
export async function armHasBills(db: Db, school: SchoolRef, armId: string) {
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, eq(bills.classArmId, armId))).limit(1)
  return !!bill
}

/** Whether any term of the session has fee items or bills (payments always belong to a bill). */
export async function sessionHasFees(db: Db, school: SchoolRef, sessionId: string) {
  const termIds = (await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, sessionId)))).map(t => t.id)
  if (!termIds.length) return false
  const [item] = await db.select({ id: feeItems.id }).from(feeItems).where(whereSchool(feeItems, school, inArray(feeItems.termId, termIds))).limit(1)
  if (item) return true
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, inArray(bills.termId, termIds))).limit(1)
  return !!bill
}

const termLabel = (term: { number: (typeof TERM_NUMBERS)[number], sessionName: string }) => `${TERM_LABELS[term.number]} ${term.sessionName}`

async function findLevel(db: Db, school: SchoolRef, id: string) {
  const [level] = await db.select().from(classLevels).where(whereSchool(classLevels, school, eq(classLevels.id, id)))
  if (!level) throw notFound('Class level not found')
  return level
}

async function findArm(db: Db, school: SchoolRef, id: string) {
  const [arm] = await db.select({ id: classArms.id }).from(classArms).where(whereSchool(classArms, school, eq(classArms.id, id)))
  if (!arm) throw notFound('Class not found')
  return arm
}

/** Every class level (Nursery → SSS) with its fee items for the term. */
export async function listFeeItems(db: Db, school: SchoolRef, termId?: string) {
  const term = await resolveTerm(db, school, termId)
  const levels = await db.select().from(classLevels).where(whereSchool(classLevels, school))
  const items = await db.select().from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, term.id))).orderBy(asc(feeItems.sortOrder), asc(feeItems.name))
  return {
    term: { id: term.id, number: term.number, sessionName: term.sessionName, label: termLabel(term) },
    levels: levels
      .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder)
      .map(level => ({
        id: level.id,
        name: level.name,
        section: level.section,
        items: items.filter(i => i.classLevelId === level.id).map(i => ({ id: i.id, name: i.name, amountKobo: i.amountKobo, optional: i.optional })),
      })),
  }
}

/**
 * Replaces a level's items for a term: same-name items keep their id (so bills and optional choices stay
 * linked); removed items are deleted (bill lines keep their description and amount).
 */
export async function replaceFeeItems(db: Db, school: SchoolRef, input: { termId: string, classLevelId: string, items: { name: string, amountKobo: number, optional: boolean }[] }) {
  const level = await findLevel(db, school, input.classLevelId)
  const term = await resolveTerm(db, school, input.termId)
  await db.transaction(async (tx) => {
    const current = await tx.select().from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, term.id), eq(feeItems.classLevelId, level.id)))
    const keep = new Set(input.items.map(i => i.name.toLowerCase()))
    const gone = current.filter(i => !keep.has(i.name.toLowerCase())).map(i => i.id)
    if (gone.length) await tx.delete(feeItems).where(whereSchool(feeItems, school, inArray(feeItems.id, gone)))
    for (const [i, item] of input.items.entries()) {
      const existing = current.find(c => c.name.toLowerCase() === item.name.toLowerCase())
      if (existing) {
        await tx.update(feeItems).set({ name: item.name, amountKobo: item.amountKobo, optional: item.optional, sortOrder: i }).where(eq(feeItems.id, existing.id))
      }
      else {
        await tx.insert(feeItems).values({ schoolId: school.id, termId: term.id, classLevelId: level.id, ...item, sortOrder: i })
      }
    }
  })
  return listFeeItems(db, school, term.id)
}

/** Copies every level's items from one term to another that has none yet. */
export async function copyFeeItems(db: Db, school: SchoolRef, input: { fromTermId: string, toTermId: string }) {
  const from = await resolveTerm(db, school, input.fromTermId)
  const to = await resolveTerm(db, school, input.toTermId)
  if (from.id === to.id) throw fieldError('toTermId', 'Choose a different term to copy to')
  const [existing] = await db.select({ id: feeItems.id }).from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, to.id))).limit(1)
  if (existing) throw conflict(`${termLabel(to)} already has fee items. Edit them instead.`)
  const source = await db.select().from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, from.id)))
  if (!source.length) throw fieldError('fromTermId', `${termLabel(from)} has no fee items to copy`)
  await db.insert(feeItems).values(source.map(({ id: _id, createdAt: _c, updatedAt: _u, ...item }) => ({ ...item, termId: to.id })))
  return listFeeItems(db, school, to.id)
}

/** The term before (in the session; first term → the previous session's third term), or null. */
async function previousTerm(db: Db, school: SchoolRef, term: Term) {
  const index = TERM_NUMBERS.indexOf(term.number)
  if (index > 0) {
    const [prev] = await db.select({ id: terms.id, number: terms.number }).from(terms)
      .where(whereSchool(terms, school, eq(terms.sessionId, term.sessionId), eq(terms.number, TERM_NUMBERS[index - 1]!)))
    return prev ? { ...prev, sessionName: term.sessionName } : null
  }
  // Session names are "YYYY/YYYY", so the previous one sorts just before
  const [prev] = await db.select({ id: terms.id, number: terms.number, sessionName: academicSessions.name }).from(terms)
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(terms, school, eq(terms.number, 'third'), sql`${academicSessions.name} < ${term.sessionName}`))
    .orderBy(sql`${academicSessions.name} desc`).limit(1)
  return prev ?? null
}

/** Balances of bills, by bill id (lines, discounts and payments loaded in three queries). */
async function balances(db: Db, school: SchoolRef, billIds: string[]) {
  if (!billIds.length) return new Map<string, ReturnType<typeof billBalance>>()
  const lines = await db.select().from(billLines).where(whereSchool(billLines, school, inArray(billLines.billId, billIds)))
  const rules = await db.select().from(discounts).where(whereSchool(discounts, school, inArray(discounts.billId, billIds)))
  const paid = await db.select({ billId: payments.billId, amountKobo: payments.amountKobo, reversedAt: payments.reversedAt }).from(payments)
    .where(whereSchool(payments, school, inArray(payments.billId, billIds)))
  return new Map(billIds.map(id => [id, billBalance({
    lines: lines.filter(l => l.billId === id),
    discounts: rules.filter(d => d.billId === id),
    payments: paid.filter(p => p.billId === id).map(p => ({ amountKobo: p.amountKobo, reversed: !!p.reversedAt })),
  })]))
}

/** Each student's closing balance in a term (bills only), by student id. */
async function termBalances(db: Db, school: SchoolRef, termId: string, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, number>()
  const rows = await db.select({ id: bills.id, studentId: bills.studentId }).from(bills)
    .where(whereSchool(bills, school, eq(bills.termId, termId), inArray(bills.studentId, studentIds)))
  const byBill = await balances(db, school, rows.map(r => r.id))
  return new Map(rows.map(r => [r.studentId, byBill.get(r.id)!.balance]))
}

/** Active students enrolled in the term's session (optionally one arm), with their arm and level. */
async function enrolledStudents(db: Db, school: SchoolRef, sessionId: string, armId?: string) {
  return db.select({ studentId: students.id, armId: classArms.id, levelId: classArms.classLevelId })
    .from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, sessionId), isNull(students.deletedAt), armId ? eq(studentEnrolments.classArmId, armId) : undefined))
}

/**
 * Creates the missing bills for the term (the school or one arm): each student's level's compulsory items
 * plus the previous term's balance carried forward. Existing bills are left as they are (idempotent).
 */
export async function generateBills(db: Db, school: SchoolRef, viewer: Viewer, input: { termId: string, classArmId?: string }) {
  const term = await resolveTerm(db, school, input.termId)
  if (input.classArmId) await findArm(db, school, input.classArmId)
  const enrolled = await enrolledStudents(db, school, term.sessionId, input.classArmId)
  const existing = new Set((await db.select({ studentId: bills.studentId }).from(bills)
    .where(whereSchool(bills, school, eq(bills.termId, term.id)))).map(b => b.studentId))
  const missing = enrolled.filter(e => !existing.has(e.studentId))
  if (!missing.length) return { created: 0, existing: enrolled.length }

  const items = await db.select().from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, term.id), eq(feeItems.optional, false))).orderBy(asc(feeItems.sortOrder))
  const prev = await previousTerm(db, school, term)
  const carried = prev ? await termBalances(db, school, prev.id, missing.map(m => m.studentId)) : new Map<string, number>()

  const created = await db.transaction(async (tx) => {
    // A concurrent run can't create a second bill: (term, student) is unique
    const rows = await tx.insert(bills)
      .values(missing.map(m => ({ schoolId: school.id, termId: term.id, studentId: m.studentId, classLevelId: m.levelId, classArmId: m.armId, generatedById: viewer.id })))
      .onConflictDoNothing()
      .returning({ id: bills.id, studentId: bills.studentId, levelId: bills.classLevelId })
    const lines = rows.flatMap((bill) => {
      const carry = prev ? carryForwardLine(carried.get(bill.studentId) ?? 0, termLabel(prev)) : null
      return [
        ...items.filter(i => i.classLevelId === bill.levelId).map(i => ({ schoolId: school.id, billId: bill.id, feeItemId: i.id, kind: 'item' as const, description: i.name, amountKobo: i.amountKobo })),
        ...(carry ? [{ schoolId: school.id, billId: bill.id, feeItemId: null, ...carry }] : []),
      ]
    })
    if (lines.length) await tx.insert(billLines).values(lines)
    return rows.length
  })
  return { created, existing: enrolled.length - created }
}

/**
 * Re-syncs bills with the fee items and the previous term's balance: item lines only on bills with no
 * payments (keeping chosen optional items that still exist); the carry-forward line on every bill.
 */
export async function refreshBills(db: Db, school: SchoolRef, input: { termId: string, classArmId?: string }) {
  const term = await resolveTerm(db, school, input.termId)
  if (input.classArmId) await findArm(db, school, input.classArmId)
  const scope = await db.select({ id: bills.id, studentId: bills.studentId, levelId: bills.classLevelId }).from(bills)
    .where(whereSchool(bills, school, eq(bills.termId, term.id), input.classArmId ? eq(bills.classArmId, input.classArmId) : undefined))
  if (!scope.length) return { refreshed: 0, kept: 0 }
  const ids = scope.map(b => b.id)
  const items = await db.select().from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.termId, term.id))).orderBy(asc(feeItems.sortOrder))
  const withPayments = new Set((await db.select({ billId: payments.billId }).from(payments).where(whereSchool(payments, school, inArray(payments.billId, ids)))).map(p => p.billId))
  const lines = await db.select().from(billLines).where(whereSchool(billLines, school, inArray(billLines.billId, ids)))
  const prev = await previousTerm(db, school, term)
  const carried = prev ? await termBalances(db, school, prev.id, scope.map(b => b.studentId)) : new Map<string, number>()

  let refreshed = 0
  await db.transaction(async (tx) => {
    for (const bill of scope) {
      await tx.delete(billLines).where(whereSchool(billLines, school, eq(billLines.billId, bill.id), eq(billLines.kind, 'carry_forward')))
      const carry = prev ? carryForwardLine(carried.get(bill.studentId) ?? 0, termLabel(prev)) : null
      const fresh: (typeof billLines.$inferInsert)[] = carry ? [{ schoolId: school.id, billId: bill.id, feeItemId: null, ...carry }] : []
      if (!withPayments.has(bill.id)) {
        const chosen = new Set(lines.filter(l => l.billId === bill.id && l.kind === 'item').map(l => l.feeItemId))
        await tx.delete(billLines).where(whereSchool(billLines, school, eq(billLines.billId, bill.id), eq(billLines.kind, 'item')))
        for (const item of items.filter(i => i.classLevelId === bill.levelId && (!i.optional || chosen.has(i.id)))) {
          fresh.push({ schoolId: school.id, billId: bill.id, feeItemId: item.id, kind: 'item', description: item.name, amountKobo: item.amountKobo })
        }
        refreshed++
      }
      if (fresh.length) await tx.insert(billLines).values(fresh)
    }
  })
  return { refreshed, kept: scope.length - refreshed }
}

/** Bills for the term with student, class and totals; searchable by name or admission number; 25 per page. */
export async function listBills(db: Db, school: SchoolRef, query: { termId?: string, classArmId?: string, search?: string, page: number }) {
  const term = await resolveTerm(db, school, query.termId)
  const pattern = query.search ? `%${query.search}%` : null
  const rows = await db.select({
    id: bills.id,
    studentId: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    arm: classArms.name,
    level: classLevels.name,
  })
    .from(bills)
    .innerJoin(students, eq(bills.studentId, students.id))
    .innerJoin(classArms, eq(bills.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(bills, school,
      eq(bills.termId, term.id),
      query.classArmId ? eq(bills.classArmId, query.classArmId) : undefined,
      pattern ? or(ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, pattern), ilike(students.admissionNumber, pattern)) : undefined))
    .orderBy(asc(students.lastName), asc(students.firstName))
  const page = rows.slice((query.page - 1) * BILLS_PAGE_SIZE, query.page * BILLS_PAGE_SIZE)
  const byBill = await balances(db, school, page.map(r => r.id))
  return {
    term: { id: term.id, label: termLabel(term) },
    total: rows.length,
    page: query.page,
    pageSize: BILLS_PAGE_SIZE,
    items: page.map((r) => {
      const b = byBill.get(r.id)!
      return {
        id: r.id,
        studentId: r.studentId,
        name: `${r.firstName} ${r.lastName}`,
        admissionNumber: r.admissionNumber,
        classLabel: classArmLabel(r.level, r.arm),
        billed: b.billed,
        discount: b.discountTotal,
        paid: b.paid,
        balance: b.balance,
      }
    }),
  }
}

async function findBill(db: Db, school: SchoolRef, id: string) {
  const [bill] = await db.select().from(bills).where(whereSchool(bills, school, eq(bills.id, id)))
  if (!bill) throw notFound('Bill not found')
  return bill
}

/** The student's optional items for the bill: replaces the optional lines (compulsory lines untouched). */
export async function setOptionalItems(db: Db, school: SchoolRef, billId: string, feeItemIds: string[]) {
  const bill = await findBill(db, school, billId)
  const optional = await db.select().from(feeItems)
    .where(whereSchool(feeItems, school, eq(feeItems.termId, bill.termId), eq(feeItems.classLevelId, bill.classLevelId), eq(feeItems.optional, true)))
  const chosen = new Set(feeItemIds)
  if (feeItemIds.some(id => !optional.some(i => i.id === id))) throw fieldError('feeItemIds', 'Choose optional items for this student\'s class')
  await db.transaction(async (tx) => {
    if (optional.length) await tx.delete(billLines).where(whereSchool(billLines, school, eq(billLines.billId, bill.id), inArray(billLines.feeItemId, optional.map(i => i.id))))
    const lines = optional.filter(i => chosen.has(i.id)).map(i => ({ schoolId: school.id, billId: bill.id, feeItemId: i.id, kind: 'item' as const, description: i.name, amountKobo: i.amountKobo }))
    if (lines.length) await tx.insert(billLines).values(lines)
  })
  return { billId: bill.id }
}

export async function addDiscount(db: Db, school: SchoolRef, viewer: Viewer, billId: string, input: DiscountRule & { reason: string }) {
  const bill = await findBill(db, school, billId)
  await db.insert(discounts).values({ schoolId: school.id, billId: bill.id, ...input, createdById: viewer.id })
  return { billId: bill.id }
}

/** Discounts aren't money received, so they can be removed (payments can only be reversed). */
export async function removeDiscount(db: Db, school: SchoolRef, discountId: string) {
  const [removed] = await db.delete(discounts).where(whereSchool(discounts, school, eq(discounts.id, discountId))).returning({ billId: discounts.billId })
  if (!removed) throw notFound('Discount not found')
  return removed
}

/** A bill in full: lines (with whether they're optional), discounts with their amounts, payments, totals. */
export async function billDetails(db: Db, school: SchoolRef, billId: string) {
  const bill = await findBill(db, school, billId)
  const lines = await db.select({ id: billLines.id, feeItemId: billLines.feeItemId, kind: billLines.kind, description: billLines.description, amountKobo: billLines.amountKobo })
    .from(billLines).where(whereSchool(billLines, school, eq(billLines.billId, bill.id))).orderBy(asc(billLines.createdAt))
  const rules = await db.select().from(discounts).where(whereSchool(discounts, school, eq(discounts.billId, bill.id))).orderBy(asc(discounts.createdAt))
  const paid = await db.select({
    id: payments.id,
    receiptNumber: payments.receiptNumber,
    amountKobo: payments.amountKobo,
    method: payments.method,
    reference: payments.reference,
    paidOn: payments.paidOn,
    receivedBy: users.name,
    reversedAt: payments.reversedAt,
    reversalReason: payments.reversalReason,
  }).from(payments).leftJoin(users, eq(payments.receivedById, users.id))
    .where(whereSchool(payments, school, eq(payments.billId, bill.id))).orderBy(asc(payments.createdAt))
  const optional = await db.select({ id: feeItems.id, name: feeItems.name, amountKobo: feeItems.amountKobo }).from(feeItems)
    .where(whereSchool(feeItems, school, eq(feeItems.termId, bill.termId), eq(feeItems.classLevelId, bill.classLevelId), eq(feeItems.optional, true)))
    .orderBy(asc(feeItems.sortOrder))
  const itemsTotal = lines.filter(l => l.kind === 'item').reduce((sum, l) => sum + l.amountKobo, 0)
  const amounts = discountAmounts(itemsTotal, rules)

  return {
    id: bill.id,
    termId: bill.termId,
    classArmId: bill.classArmId,
    lines,
    optionalItems: optional.map(i => ({ ...i, selected: lines.some(l => l.feeItemId === i.id) })),
    discounts: rules.map((d, i) => ({ id: d.id, kind: d.kind, value: d.value, reason: d.reason, amountKobo: amounts[i]! })),
    payments: paid.map(p => ({ ...p, reversed: !!p.reversedAt })),
    totals: billBalance({ lines, discounts: rules, payments: paid.map(p => ({ amountKobo: p.amountKobo, reversed: !!p.reversedAt })) }),
  }
}

export { balances, termLabel }
