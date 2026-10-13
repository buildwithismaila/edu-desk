import { and, eq, inArray, isNull } from 'drizzle-orm'
import { TERM_NUMBERS } from '../../shared/constants/academics'
import { classArmLabel } from '../../shared/utils/academics'
import { academicSessions, bills, classArms, classLevels, publishedResults, studentEnrolments, studentGuardians, students, terms } from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { studentAttendanceSummary } from './attendance'
import { billDetails, termLabel } from './fees'
import { listMyChildren, studentPhotoUrl } from './guardians'
import { getPayment, termBalanceOf } from './payments'
import type { ReportCard } from './results'
import { resolveTerm } from './terms'

// Parent portal (docs/features/09-parent-portal.md): read-only views of a parent's own children.

type SchoolRef = { id: string }
type Parent = { id: string }
type TermRow = { id: string, number: (typeof TERM_NUMBERS)[number], sessionName: string }

/** Newest first: session, then term order. */
const newestFirst = (a: TermRow, b: TermRow) => b.sessionName.localeCompare(a.sessionName) || TERM_NUMBERS.indexOf(b.number) - TERM_NUMBERS.indexOf(a.number)
const termOption = (t: TermRow) => ({ id: t.id, label: termLabel(t) })

/**
 * The parent's own, non-removed child in this school; 404 otherwise (another family's or school's child,
 * or a removed one), so a child's existence is never revealed. Every parent route starts with this.
 */
export async function requireOwnChild(db: Db, school: SchoolRef, parent: Parent, studentId: string) {
  const [child] = await db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    photoKey: students.photoKey,
    photoUpdatedAt: students.photoUpdatedAt,
  })
    .from(studentGuardians)
    .innerJoin(students, eq(studentGuardians.studentId, students.id))
    .where(whereSchool(studentGuardians, school, eq(studentGuardians.guardianId, parent.id), eq(studentGuardians.studentId, studentId), eq(students.schoolId, school.id), isNull(students.deletedAt)))
  if (!child) throw notFound('Student not found')
  return child
}
type Child = Awaited<ReturnType<typeof requireOwnChild>>

/** "My children" cards: class, this term's attendance and fee balance, and the latest published report card. */
export async function myChildren(db: Db, school: SchoolRef, parent: Parent) {
  const children = await listMyChildren(db, school, parent.id)
  const ids = children.map(c => c.id)
  const [currentTerm] = await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.isCurrent, true)))
  const balances = currentTerm ? await termBalanceOf(db, school, currentTerm.id, ids) : new Map<string, number>()
  const published = ids.length
    ? await db.select({ studentId: publishedResults.studentId, id: terms.id, number: terms.number, sessionName: academicSessions.name })
        .from(publishedResults)
        .innerJoin(terms, eq(publishedResults.termId, terms.id))
        .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
        .where(whereSchool(publishedResults, school, inArray(publishedResults.studentId, ids)))
    : []

  return Promise.all(children.map(async (child) => {
    const attendance = currentTerm ? await studentAttendanceSummary(db, school, child.id, currentTerm.id) : null
    const [latest] = published.filter(p => p.studentId === child.id).sort(newestFirst)
    return {
      ...child,
      attendanceRate: attendance?.rate ?? null,
      absentDays: attendance?.absent ?? 0,
      balanceKobo: balances.get(child.id) ?? null,
      latestReportCard: latest ? { termId: latest.id, term: termLabel(latest) } : null,
    }
  }))
}

/** The child's page header, plus the terms for the attendance and fees pickers (newest first). */
export async function childOverview(db: Db, school: SchoolRef, child: Child) {
  const [current] = await db.select({ id: terms.id, sessionId: terms.sessionId }).from(terms).where(whereSchool(terms, school, eq(terms.isCurrent, true)))
  const [enrolment] = current
    ? await db.select({ arm: classArms.name, level: classLevels.name })
        .from(studentEnrolments)
        .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
        .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
        .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.studentId, child.id), eq(studentEnrolments.sessionId, current.sessionId)))
    : []
  const termColumns = { id: terms.id, number: terms.number, sessionName: academicSessions.name }
  // Every term of the sessions the child was enrolled in
  const attendanceTerms = await db.select(termColumns)
    .from(studentEnrolments)
    .innerJoin(terms, eq(terms.sessionId, studentEnrolments.sessionId))
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.studentId, child.id)))
  const feeTerms = await db.select(termColumns)
    .from(bills)
    .innerJoin(terms, eq(bills.termId, terms.id))
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(bills, school, eq(bills.studentId, child.id)))

  return {
    id: child.id,
    name: `${child.firstName} ${child.lastName}`,
    admissionNumber: child.admissionNumber,
    classLabel: enrolment ? classArmLabel(enrolment.level, enrolment.arm) : null,
    photoUrl: studentPhotoUrl(child),
    currentTermId: current?.id ?? null,
    attendanceTerms: attendanceTerms.sort(newestFirst).map(termOption),
    feeTerms: feeTerms.sort(newestFirst).map(termOption),
  }
}

/** The child's published report cards, newest first (positions only where the card shows them). */
export async function childResults(db: Db, school: SchoolRef, child: Child) {
  const rows = await db.select({ id: terms.id, number: terms.number, sessionName: academicSessions.name, report: publishedResults.report, publishedAt: publishedResults.createdAt })
    .from(publishedResults)
    .innerJoin(terms, eq(publishedResults.termId, terms.id))
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(publishedResults, school, eq(publishedResults.studentId, child.id)))
  return rows.sort(newestFirst).map(({ report, ...row }) => {
    const { summary } = report as ReportCard
    return {
      termId: row.id,
      term: termLabel(row),
      publishedAt: row.publishedAt,
      average: summary.average,
      position: summary.showPositions ? summary.position : null,
      numberInClass: summary.showPositions ? summary.numberInClass : null,
    }
  })
}

/** A term's attendance (default the current term): counts, rate and the days absent or late. */
export async function childAttendance(db: Db, school: SchoolRef, child: Child, termId?: string) {
  const { term, ...summary } = await studentAttendanceSummary(db, school, child.id, termId)
  return { term: termOption(term), ...summary }
}

/**
 * A term's bill (default the current term), or null: lines, discounts, totals and payments with reversed
 * ones flagged. Reversal reasons, who took the money, optional-item choices and the ledger stay staff-only.
 */
export async function childFees(db: Db, school: SchoolRef, child: Child, termId?: string) {
  const term = await resolveTerm(db, school, termId)
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, and(eq(bills.studentId, child.id), eq(bills.termId, term.id))))
  if (!bill) return { term: termOption(term), bill: null }
  const details = await billDetails(db, school, bill.id)
  return {
    term: termOption(term),
    bill: {
      lines: details.lines.map(l => ({ kind: l.kind, description: l.description, amountKobo: l.amountKobo })),
      discounts: details.discounts.map(d => ({ reason: d.reason, amountKobo: d.amountKobo })),
      payments: details.payments.map(p => ({ id: p.id, receiptNumber: p.receiptNumber, amountKobo: p.amountKobo, method: p.method, paidOn: p.paidOn, reversed: p.reversed })),
      totals: details.totals,
    },
  }
}

/** A receipt for a payment on the child's bills (404 for anyone else's), without who reversed it or why. */
export async function childReceipt(db: Db, school: SchoolRef, child: Child, paymentId: string) {
  const receipt = await getPayment(db, school, paymentId)
  if (receipt.student.id !== child.id) throw notFound('Payment not found')
  return { ...receipt, reversal: receipt.reversal ? { at: receipt.reversal.at } : null }
}
