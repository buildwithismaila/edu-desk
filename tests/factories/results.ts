import type { ResultStatus } from '~~/shared/utils/results'
import { resultStatuses, type School } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

type SchoolRef = Pick<School, 'id'>

/** Sets an arm's results status for a term directly (no checks: the API does those). */
export async function setResultStatus(db: Db, school: SchoolRef, { term, arm, status }: { term: { id: string }, arm: { id: string }, status: ResultStatus }) {
  const [row] = await db.insert(resultStatuses).values({ schoolId: school.id, termId: term.id, classArmId: arm.id, status }).returning()
  return row!
}
