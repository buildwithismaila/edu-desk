import { eq, inArray } from 'drizzle-orm'
import { nurseryRatings, scoreEntries, scoreLocks, termComments, terms, traitRatings } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'

type SchoolRef = { id: string }

/** Whether the subject has any scores or Nursery ratings (any term): deleting it would lose them. */
export async function subjectHasScores(db: Db, school: SchoolRef, subjectId: string) {
  const [score] = await db.select({ id: scoreEntries.id }).from(scoreEntries)
    .where(whereSchool(scoreEntries, school, eq(scoreEntries.subjectId, subjectId))).limit(1)
  if (score) return true
  const [rating] = await db.select({ id: nurseryRatings.id }).from(nurseryRatings)
    .where(whereSchool(nurseryRatings, school, eq(nurseryRatings.subjectId, subjectId))).limit(1)
  return !!rating
}

/** Whether any term of the session has scores, ratings, comments or locks. */
export async function sessionHasScores(db: Db, school: SchoolRef, sessionId: string) {
  const termIds = (await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, sessionId)))).map(t => t.id)
  if (!termIds.length) return false
  for (const table of [scoreEntries, nurseryRatings, traitRatings, termComments, scoreLocks]) {
    const [row] = await db.select({ id: table.id }).from(table).where(whereSchool(table, school, inArray(table.termId, termIds))).limit(1)
    if (row) return true
  }
  return false
}

/** Whether the school has entered any score: the assessment split is frozen from then on. */
export async function schoolHasScores(db: Db, school: SchoolRef) {
  const [row] = await db.select({ id: scoreEntries.id }).from(scoreEntries).where(whereSchool(scoreEntries, school)).limit(1)
  return !!row
}
