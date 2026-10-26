import { eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { TERM_NUMBERS } from '../../shared/constants/academics'
import { owedByTerm } from '../../shared/utils/fees'
import { academicSessions, bills, publishedResults, resultReleases, schools, students, terms, users } from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { balances, termLabel } from './fees'

// Results withheld until fees are paid (docs/features/10d-results-withheld-for-fees.md): while the school has it on,
// a parent can't see a term's result while fees for that term are owed, unless staff released it.

type SchoolRef = { id: string }
type TermRow = { number: (typeof TERM_NUMBERS)[number], sessionName: string }

const oldestFirst = (a: TermRow, b: TermRow) => a.sessionName.localeCompare(b.sessionName) || TERM_NUMBERS.indexOf(a.number) - TERM_NUMBERS.indexOf(b.number)

export const withheldError = () => createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'This result is withheld until fees are paid' })

async function withholds(db: Db, school: SchoolRef) {
  const [row] = await db.select({ on: schools.withholdResultsUntilPaid }).from(schools).where(eq(schools.id, school.id))
  return !!row?.on
}

/** What the student still owes per term (term id → kobo), with payments clearing the oldest debt first. */
export async function owedTerms(db: Db, school: SchoolRef, studentId: string) {
  const rows = await db.select({ id: bills.id, termId: bills.termId, number: terms.number, sessionName: academicSessions.name })
    .from(bills).innerJoin(terms, eq(bills.termId, terms.id)).innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(bills, school, eq(bills.studentId, studentId)))
  const newest = rows.sort(oldestFirst).at(-1)
  if (!newest) return new Map<string, number>()
  const byBill = await balances(db, school, rows.map(r => r.id))
  const charges = rows.map((r) => {
    const b = byBill.get(r.id)!
    return { termId: r.termId, ownChargesKobo: b.itemsTotal - b.discountTotal }
  })
  return owedByTerm(charges, byBill.get(newest.id)!.balance)
}

/** The terms whose results the student's parents can't see (term id → kobo owed); empty when the school doesn't withhold. */
export async function withheldTerms(db: Db, school: SchoolRef, studentId: string) {
  if (!await withholds(db, school)) return new Map<string, number>()
  const owed = await owedTerms(db, school, studentId)
  if (!owed.size) return owed
  const released = await db.select({ termId: resultReleases.termId }).from(resultReleases)
    .where(whereSchool(resultReleases, school, eq(resultReleases.studentId, studentId), inArray(resultReleases.termId, [...owed.keys()])))
  for (const r of released) owed.delete(r.termId)
  return owed
}

/** Staff: the student's published terms that are withheld or released, for the Fees page. */
export async function resultHolds(db: Db, school: SchoolRef, studentId: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(whereSchool(students, school, eq(students.id, studentId)))
  if (!student) throw notFound('Student not found')
  const enabled = await withholds(db, school)
  const owed = enabled ? await owedTerms(db, school, student.id) : new Map<string, number>()
  const published = await db.select({ termId: publishedResults.termId, number: terms.number, sessionName: academicSessions.name })
    .from(publishedResults).innerJoin(terms, eq(publishedResults.termId, terms.id)).innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(publishedResults, school, eq(publishedResults.studentId, student.id)))
  const releases = await db.select({ termId: resultReleases.termId, by: users.name, at: resultReleases.createdAt })
    .from(resultReleases).leftJoin(users, eq(resultReleases.releasedById, users.id))
    .where(whereSchool(resultReleases, school, eq(resultReleases.studentId, student.id)))

  return {
    enabled,
    terms: published.sort(oldestFirst).reverse()
      .filter(p => owed.has(p.termId))
      .map((p) => {
        const release = releases.find(r => r.termId === p.termId)
        return { termId: p.termId, term: termLabel(p), owedKobo: owed.get(p.termId)!, released: release ? { by: release.by, at: release.at } : null }
      }),
  }
}

/** Shows a term's result to the parents although fees are owed (idempotent). */
export async function releaseResult(db: Db, school: SchoolRef, viewer: { id: string }, studentId: string, termId: string) {
  const [published] = await db.select({ id: publishedResults.id }).from(publishedResults)
    .where(whereSchool(publishedResults, school, eq(publishedResults.studentId, studentId), eq(publishedResults.termId, termId)))
  if (!published) throw notFound('No published result for this student and term')
  await db.insert(resultReleases).values({ schoolId: school.id, studentId, termId, releasedById: viewer.id }).onConflictDoNothing()
}

/** Withholds it again (while fees are owed). */
export async function withholdResultAgain(db: Db, school: SchoolRef, studentId: string, termId: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(whereSchool(students, school, eq(students.id, studentId)))
  if (!student) throw notFound('Student not found')
  await db.delete(resultReleases)
    .where(whereSchool(resultReleases, school, eq(resultReleases.studentId, studentId), eq(resultReleases.termId, termId)))
}
