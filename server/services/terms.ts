import { eq } from 'drizzle-orm'
import { academicSessions, terms } from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'

type SchoolRef = { id: string }

/**
 * The given term (404 if not the school's) or the current one (400 if none), with its session's name and
 * whether the term and its session are current.
 */
export async function resolveTerm(db: Db, school: SchoolRef, termId?: string) {
  const [term] = await db.select({
    id: terms.id,
    number: terms.number,
    startsOn: terms.startsOn,
    endsOn: terms.endsOn,
    isCurrent: terms.isCurrent,
    sessionId: terms.sessionId,
    sessionName: academicSessions.name,
    sessionIsCurrent: academicSessions.isCurrent,
  })
    .from(terms).innerJoin(academicSessions, eq(terms.sessionId, academicSessions.id))
    .where(whereSchool(terms, school, termId ? eq(terms.id, termId) : eq(terms.isCurrent, true)))
  if (term) return term
  if (termId) throw notFound('Term not found')
  throw fieldError('term', 'Set a current term first')
}
