import { DEFAULT_ASSESSMENT_COMPONENTS } from '~~/shared/constants/academics'
import { assessmentComponents, type School, scoreEntries, scoreLocks } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

type SchoolRef = Pick<School, 'id'>

/** The default split (CA1 20, CA2 20, Exam 60), in order. */
export async function createAssessmentComponents(db: Db, school: SchoolRef) {
  return db.insert(assessmentComponents)
    .values(DEFAULT_ASSESSMENT_COMPONENTS.map((c, i) => ({ ...c, schoolId: school.id, sortOrder: i }))).returning()
}

/** A score (or absent) for one cell, with no checks: the API does those. */
export async function createScore(db: Db, school: SchoolRef, { term, student, subject, component, score = null, absent = false }: {
  term: { id: string }
  student: { id: string }
  subject: { id: string }
  component: { id: string }
  score?: number | null
  absent?: boolean
}) {
  const [row] = await db.insert(scoreEntries).values({
    schoolId: school.id, termId: term.id, studentId: student.id, subjectId: subject.id, componentId: component.id, score: absent ? null : score, absent,
  }).returning()
  return row!
}

export async function lockScores(db: Db, school: SchoolRef, { term, arm }: { term: { id: string }, arm: { id: string } }) {
  const [row] = await db.insert(scoreLocks).values({ schoolId: school.id, termId: term.id, classArmId: arm.id }).returning()
  return row!
}
