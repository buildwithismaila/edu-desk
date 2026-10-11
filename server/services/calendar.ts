import { and, asc, desc, eq } from 'drizzle-orm'
import { TERM_NUMBERS } from '../../shared/constants/academics'
import { type AcademicSession, academicSessions, type Term, terms } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'

type SchoolRef = { id: string }

export function toTermDto(term: Term) {
  return {
    id: term.id,
    number: term.number,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    nextTermBeginsOn: term.nextTermBeginsOn,
    isCurrent: term.isCurrent,
  }
}

function toSessionDto(session: AcademicSession, sessionTerms: Term[]) {
  const order = (t: Term) => TERM_NUMBERS.indexOf(t.number)
  return {
    id: session.id,
    name: session.name,
    isCurrent: session.isCurrent,
    terms: [...sessionTerms].sort((a, b) => order(a) - order(b)).map(toTermDto),
  }
}

/** Sessions newest first (by name: `2026/2027` sorts after `2025/2026`), each with its three terms. */
export async function listSessions(db: Db, school: SchoolRef) {
  const sessions = await db.select().from(academicSessions).where(whereSchool(academicSessions, school)).orderBy(desc(academicSessions.name))
  const allTerms = await db.select().from(terms).where(whereSchool(terms, school)).orderBy(asc(terms.number))
  return sessions.map(s => toSessionDto(s, allTerms.filter(t => t.sessionId === s.id)))
}

/** A session with its First, Second and Third terms (docs/domain.md: exactly three per session). */
export async function createSessionWithTerms(db: Db, school: SchoolRef, name: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx.insert(academicSessions).values({ schoolId: school.id, name }).returning()
    const created = await tx.insert(terms)
      .values(TERM_NUMBERS.map(number => ({ schoolId: school.id, sessionId: session!.id, number })))
      .returning()
    return toSessionDto(session!, created)
  })
}

/**
 * Makes the term and its session the school's current ones, atomically. Unsets the old ones first:
 * the partial unique indexes allow one current row per school. Returns false if the term isn't the school's.
 */
export async function setCurrentTerm(db: Db, school: SchoolRef, termId: string) {
  return db.transaction(async (tx) => {
    const [term] = await tx.select().from(terms).where(whereSchool(terms, school, eq(terms.id, termId)))
    if (!term) return false

    await tx.update(terms).set({ isCurrent: false }).where(whereSchool(terms, school, eq(terms.isCurrent, true)))
    await tx.update(academicSessions).set({ isCurrent: false })
      .where(whereSchool(academicSessions, school, eq(academicSessions.isCurrent, true)))
    await tx.update(academicSessions).set({ isCurrent: true })
      .where(whereSchool(academicSessions, school, eq(academicSessions.id, term.sessionId)))
    await tx.update(terms).set({ isCurrent: true }).where(whereSchool(terms, school, eq(terms.id, term.id)))
    return true
  })
}

/** The school's current session and term (either may be null). */
export async function getCurrentTerm(db: Db, school: SchoolRef) {
  const [row] = await db
    .select({ session: academicSessions, term: terms })
    .from(terms)
    .innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(and(whereSchool(terms, school, eq(terms.isCurrent, true)), eq(academicSessions.schoolId, school.id)))
  if (!row) return { session: null, term: null }
  const { isCurrent: _isCurrent, ...term } = toTermDto(row.term)
  return { session: { id: row.session.id, name: row.session.name }, term }
}
