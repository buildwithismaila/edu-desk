import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { SECTIONS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import type { PAYMENT_METHODS } from '../../shared/schemas/fees'
import { classArmLabel } from '../../shared/utils/academics'
import { formatReceiptNumber, ledger, type LedgerBill } from '../../shared/utils/fees'
import {
  academicSessions,
  billLines,
  bills,
  classArms,
  classLevels,
  discounts,
  payments,
  receiptCounters,
  schools,
  students,
  terms,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { schoolLogoUrl } from '../utils/school'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { balances, billDetails, findBill, termLabel } from './fees'
import { resolveTerm } from './terms'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }
type Method = typeof PAYMENT_METHODS[number]

/**
 * Records money received against a bill, with the next receipt number for the payment year (the counter
 * is incremented in the same transaction, so concurrent payments never share a number).
 */
export async function recordPayment(db: Db, school: SchoolRef, viewer: Viewer, input: { billId: string, amountKobo: number, method: Method, paidOn: string, reference: string | null }, today: string) {
  const bill = await findBill(db, school, input.billId)
  if (input.paidOn > today) throw fieldError('paidOn', 'The payment date can\'t be in the future')
  const year = Number(input.paidOn.slice(0, 4))

  const id = await db.transaction(async (tx) => {
    const [counter] = await tx.insert(receiptCounters).values({ schoolId: school.id, year, lastNumber: 1 })
      .onConflictDoUpdate({ target: [receiptCounters.schoolId, receiptCounters.year], set: { lastNumber: sql`${receiptCounters.lastNumber} + 1` } })
      .returning({ lastNumber: receiptCounters.lastNumber })
    const [payment] = await tx.insert(payments).values({
      schoolId: school.id,
      studentId: bill.studentId,
      billId: bill.id,
      amountKobo: input.amountKobo,
      method: input.method,
      reference: input.reference,
      paidOn: input.paidOn,
      receiptNumber: formatReceiptNumber(year, counter!.lastNumber),
      receivedById: viewer.id,
    }).returning({ id: payments.id })
    return payment!.id
  })
  return getPayment(db, school, id)
}

/** Reverses a payment once, with a reason. The row stays (audit trail); only the reversal fields are set. */
export async function reversePayment(db: Db, school: SchoolRef, viewer: Viewer, id: string, reason: string) {
  const [reversed] = await db.update(payments)
    .set({ reversedAt: new Date(), reversedById: viewer.id, reversalReason: reason })
    .where(whereSchool(payments, school, eq(payments.id, id), isNull(payments.reversedAt)))
    .returning({ id: payments.id })
  if (!reversed) {
    const [existing] = await db.select({ id: payments.id }).from(payments).where(whereSchool(payments, school, eq(payments.id, id)))
    if (!existing) throw notFound('Payment not found')
    throw conflict('This payment is already reversed')
  }
  return getPayment(db, school, id)
}

const receivedBy = alias(users, 'received_by')
const reversedBy = alias(users, 'reversed_by')

/** Everything a receipt shows, including the bill's balance now. */
export async function getPayment(db: Db, school: SchoolRef, id: string) {
  const [row] = await db.select({
    payment: payments,
    receivedBy: receivedBy.name,
    reversedBy: reversedBy.name,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    arm: classArms.name,
    level: classLevels.name,
    termNumber: terms.number,
    sessionName: academicSessions.name,
  })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
    .innerJoin(bills, eq(payments.billId, bills.id))
    .innerJoin(classArms, eq(bills.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .innerJoin(terms, eq(bills.termId, terms.id))
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .leftJoin(receivedBy, eq(payments.receivedById, receivedBy.id))
    .leftJoin(reversedBy, eq(payments.reversedById, reversedBy.id))
    .where(whereSchool(payments, school, eq(payments.id, id)))
  if (!row) throw notFound('Payment not found')
  const [schoolRow] = await db.select().from(schools).where(eq(schools.id, school.id))
  const balance = (await balances(db, school, [row.payment.billId])).get(row.payment.billId)!.balance
  const p = row.payment
  return {
    id: p.id,
    receiptNumber: p.receiptNumber,
    amountKobo: p.amountKobo,
    method: p.method,
    reference: p.reference,
    paidOn: p.paidOn,
    channel: p.channel,
    receivedBy: row.receivedBy,
    billId: p.billId,
    student: { id: p.studentId, name: `${row.firstName} ${row.lastName}`, admissionNumber: row.admissionNumber },
    classLabel: classArmLabel(row.level, row.arm),
    term: termLabel({ number: row.termNumber, sessionName: row.sessionName }),
    balanceKobo: balance,
    reversal: p.reversedAt ? { at: p.reversedAt, by: row.reversedBy, reason: p.reversalReason } : null,
    school: { name: schoolRow!.name, address: schoolRow!.address, phone: schoolRow!.phone, email: schoolRow!.email, logoUrl: schoolLogoUrl(schoolRow!) },
  }
}

/** A student's fees: the term's bill (or null) and the ledger across every term. */
export async function studentFees(db: Db, school: SchoolRef, studentId: string, termId?: string) {
  const [student] = await db.select().from(students).where(whereSchool(students, school, eq(students.id, studentId)))
  if (!student) throw notFound('Student not found')
  const term = await resolveTerm(db, school, termId)

  const all = await db.select({ id: bills.id, termId: bills.termId, createdAt: bills.createdAt, number: terms.number, sessionName: academicSessions.name })
    .from(bills).innerJoin(terms, eq(bills.termId, terms.id)).innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(bills, school, eq(bills.studentId, student.id)))
  const ids = all.map(b => b.id)
  const lines = ids.length ? await db.select().from(billLines).where(whereSchool(billLines, school, inArray(billLines.billId, ids))).orderBy(asc(billLines.createdAt)) : []
  const rules = ids.length ? await db.select().from(discounts).where(whereSchool(discounts, school, inArray(discounts.billId, ids))).orderBy(asc(discounts.createdAt)) : []
  const paid = ids.length ? await db.select().from(payments).where(whereSchool(payments, school, inArray(payments.billId, ids))).orderBy(asc(payments.createdAt)) : []
  const dateOf = (d: Date) => d.toISOString().slice(0, 10)
  const ledgerBills: LedgerBill[] = all
    // Oldest term first: session name, then term order
    .sort((a, b) => a.sessionName.localeCompare(b.sessionName) || ['first', 'second', 'third'].indexOf(a.number) - ['first', 'second', 'third'].indexOf(b.number))
    .map(b => ({
      term: termLabel(b),
      date: dateOf(b.createdAt),
      lines: lines.filter(l => l.billId === b.id),
      discounts: rules.filter(d => d.billId === b.id).map(d => ({ ...d, date: dateOf(d.createdAt) })),
      payments: paid.filter(p => p.billId === b.id).map(p => ({
        date: p.paidOn,
        receiptNumber: p.receiptNumber,
        amountKobo: p.amountKobo,
        reversal: p.reversedAt ? { date: dateOf(p.reversedAt), reason: p.reversalReason ?? '' } : null,
      })),
    }))

  const current = all.find(b => b.termId === term.id)
  return {
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`, admissionNumber: student.admissionNumber, removed: !!student.deletedAt },
    term: { id: term.id, label: termLabel(term) },
    bill: current ? await billDetails(db, school, current.id) : null,
    ledger: ledger(ledgerBills),
  }
}

/** Term bills with their balances, with student, class and level (one arm or the school). */
async function termBills(db: Db, school: SchoolRef, termId: string, armId?: string) {
  const rows = await db.select({
    id: bills.id,
    studentId: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    deletedAt: students.deletedAt,
    levelId: classLevels.id,
    level: classLevels.name,
    section: classLevels.section,
    sortOrder: classLevels.sortOrder,
    arm: classArms.name,
  })
    .from(bills)
    .innerJoin(students, eq(bills.studentId, students.id))
    .innerJoin(classArms, eq(bills.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(bills, school, eq(bills.termId, termId), armId ? eq(bills.classArmId, armId) : undefined))
  const byBill = await balances(db, school, rows.map(r => r.id))
  return rows.map(r => ({ ...r, ...byBill.get(r.id)! }))
}

/** Students who owe (balance > 0), largest first, with the total owed. */
export async function debtors(db: Db, school: SchoolRef, query: { termId?: string, classArmId?: string }) {
  const term = await resolveTerm(db, school, query.termId)
  const rows = (await termBills(db, school, term.id, query.classArmId)).filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.lastName.localeCompare(b.lastName))
  return {
    term: { id: term.id, label: termLabel(term) },
    count: rows.length,
    totalKobo: rows.reduce((sum, r) => sum + r.balance, 0),
    students: rows.map(r => ({
      billId: r.id,
      studentId: r.studentId,
      name: `${r.firstName} ${r.lastName}`,
      admissionNumber: r.admissionNumber,
      classLabel: classArmLabel(r.level, r.arm),
      removed: !!r.deletedAt,
      billed: r.billed,
      discount: r.discountTotal,
      paid: r.paid,
      balance: r.balance,
    })),
  }
}

/**
 * The term's money: expected (billed − discounts) vs collected (payments not reversed), outstanding and
 * credit; by class level, by payment method and by day. expected − collected = outstanding − credit.
 */
export async function collections(db: Db, school: SchoolRef, query: { termId?: string }) {
  const term = await resolveTerm(db, school, query.termId)
  const rows = await termBills(db, school, term.id)
  const ids = rows.map(r => r.id)
  const received = ids.length
    ? await db.select({ amountKobo: payments.amountKobo, method: payments.method, paidOn: payments.paidOn }).from(payments)
        .where(whereSchool(payments, school, inArray(payments.billId, ids), isNull(payments.reversedAt)))
    : []
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

  const levels = [...new Map(rows.map(r => [r.levelId, r])).values()]
    .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder)
  const byDay = new Map<string, number>()
  for (const p of received) byDay.set(p.paidOn, (byDay.get(p.paidOn) ?? 0) + p.amountKobo)

  return {
    term: { id: term.id, label: termLabel(term) },
    bills: rows.length,
    expectedKobo: sum(rows.map(r => r.billed - r.discountTotal)),
    collectedKobo: sum(received.map(p => p.amountKobo)),
    outstandingKobo: sum(rows.filter(r => r.balance > 0).map(r => r.balance)),
    creditKobo: sum(rows.filter(r => r.balance < 0).map(r => -r.balance)),
    byLevel: levels.map((level) => {
      const of = rows.filter(r => r.levelId === level.levelId)
      return { level: level.level, bills: of.length, expectedKobo: sum(of.map(r => r.billed - r.discountTotal)), collectedKobo: sum(of.map(r => r.paid)) }
    }),
    byMethod: (['cash', 'transfer', 'pos'] as const).map(method => ({
      method,
      count: received.filter(p => p.method === method).length,
      amountKobo: sum(received.filter(p => p.method === method).map(p => p.amountKobo)),
    })),
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amountKobo]) => ({ date, amountKobo })),
  }
}

/** The student's balance on a term's bill (null without a bill): for the report card's fees line. */
export async function termBalanceOf(db: Db, school: SchoolRef, termId: string, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, number>()
  const rows = await db.select({ id: bills.id, studentId: bills.studentId }).from(bills)
    .where(whereSchool(bills, school, and(eq(bills.termId, termId), inArray(bills.studentId, studentIds))))
  const byBill = await balances(db, school, rows.map(r => r.id))
  return new Map(rows.map(r => [r.studentId, byBill.get(r.id)!.balance]))
}
