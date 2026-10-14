import { and, asc, eq, inArray } from 'drizzle-orm'
import { classArmLabel } from '../../shared/utils/academics'
import { SCHOOL_TIME_ZONE, todayIn } from '../../shared/utils/dates'
import { academicSessions, bills, classArms, classLevels, schools, students, terms } from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { schoolLogoUrl } from '../utils/school'
import { whereSchool } from '../utils/tenant'
import { billDetails, termLabel } from './fees'
import { findArm } from './scores'
import { resolveTerm } from './terms'

// Fee invoices (docs/features/10a-pilot-readiness.md): a print of the live bill with the school's bank
// accounts. Nothing is stored and there are no invoice numbers; the admission number is the payment reference.

type SchoolRef = { id: string }

async function schoolHeader(db: Db, school: SchoolRef) {
  const [row] = await db.select().from(schools).where(eq(schools.id, school.id))
  return { name: row!.name, address: row!.address, phone: row!.phone, email: row!.email, logoUrl: schoolLogoUrl(row!), bankAccounts: row!.bankAccounts }
}

/** Invoices for these bills (all of this school), ordered by surname. */
async function invoicesFor(db: Db, school: SchoolRef, billIds: string[]) {
  if (!billIds.length) return []
  const header = await schoolHeader(db, school)
  const issuedOn = todayIn(SCHOOL_TIME_ZONE)
  const rows = await db.select({
    id: bills.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    arm: classArms.name,
    level: classLevels.name,
    termNumber: terms.number,
    sessionName: academicSessions.name,
  })
    .from(bills)
    .innerJoin(students, eq(bills.studentId, students.id))
    .innerJoin(classArms, eq(bills.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .innerJoin(terms, eq(bills.termId, terms.id))
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(bills, school, inArray(bills.id, billIds)))
    .orderBy(asc(students.lastName), asc(students.firstName))

  return Promise.all(rows.map(async (row) => {
    const bill = await billDetails(db, school, row.id)
    return {
      billId: row.id,
      school: header,
      student: { name: `${row.firstName} ${row.lastName}`, admissionNumber: row.admissionNumber },
      classLabel: classArmLabel(row.level, row.arm),
      term: termLabel({ number: row.termNumber, sessionName: row.sessionName }),
      issuedOn,
      lines: bill.lines.map(l => ({ kind: l.kind, description: l.description, amountKobo: l.amountKobo })),
      discounts: bill.discounts.map(d => ({ reason: d.reason, amountKobo: d.amountKobo })),
      totals: bill.totals,
    }
  }))
}

/** One bill's invoice (404 for another school's bill). */
export async function billInvoice(db: Db, school: SchoolRef, billId: string) {
  const [invoice] = await invoicesFor(db, school, [billId])
  if (!invoice) throw notFound('Bill not found')
  return invoice
}

/** Every billed student's invoice in a class for a term (default the current term). */
export async function classInvoices(db: Db, school: SchoolRef, query: { termId?: string, classArmId: string }) {
  const arm = await findArm(db, school, query.classArmId)
  const term = await resolveTerm(db, school, query.termId)
  const ids = (await db.select({ id: bills.id }).from(bills)
    .where(whereSchool(bills, school, and(eq(bills.termId, term.id), eq(bills.classArmId, arm.id))))).map(b => b.id)
  return { term: { id: term.id, label: termLabel(term) }, arm: { id: arm.id, label: arm.label }, invoices: await invoicesFor(db, school, ids) }
}

/** A student's invoice for a term (default the current term); 404 when that term has no bill. */
export async function studentInvoice(db: Db, school: SchoolRef, studentId: string, termId?: string) {
  const term = await resolveTerm(db, school, termId)
  const [bill] = await db.select({ id: bills.id }).from(bills)
    .where(whereSchool(bills, school, and(eq(bills.studentId, studentId), eq(bills.termId, term.id))))
  if (!bill) throw notFound('No bill for this term yet')
  return billInvoice(db, school, bill.id)
}
