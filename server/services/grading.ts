import { asc, desc, eq } from 'drizzle-orm'
import { GRADED_SECTIONS, type GradedSection } from '../../shared/constants/academics'
import type { AssessmentComponentInput } from '../../shared/utils/assessment'
import type { GradeBand } from '../../shared/utils/grading'
import { assessmentComponents, gradeBands } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'

type SchoolRef = { id: string }

// Callers validate first (shared/schemas/grading.ts); replacing is one transaction, so a failure keeps the old set.
// Phase 6 adds "locked once scores exist" to both replacements.

export function listAssessmentComponents(db: Db, school: SchoolRef) {
  return db.select({ id: assessmentComponents.id, name: assessmentComponents.name, maxScore: assessmentComponents.maxScore })
    .from(assessmentComponents).where(whereSchool(assessmentComponents, school)).orderBy(asc(assessmentComponents.sortOrder))
}

export async function replaceAssessmentComponents(db: Db, school: SchoolRef, components: AssessmentComponentInput[]) {
  await db.transaction(async (tx) => {
    await tx.delete(assessmentComponents).where(whereSchool(assessmentComponents, school))
    await tx.insert(assessmentComponents).values(components.map((c, i) => ({ ...c, schoolId: school.id, sortOrder: i })))
  })
  return listAssessmentComponents(db, school)
}

const bandColumns = { id: gradeBands.id, grade: gradeBands.grade, minScore: gradeBands.minScore, maxScore: gradeBands.maxScore, remark: gradeBands.remark }

/** One section's bands, highest first (as on report cards). */
function listBands(db: Db, school: SchoolRef, section: GradedSection) {
  return db.select(bandColumns).from(gradeBands)
    .where(whereSchool(gradeBands, school, eq(gradeBands.section, section))).orderBy(desc(gradeBands.minScore))
}

export async function listGradingScales(db: Db, school: SchoolRef) {
  const entries = await Promise.all(GRADED_SECTIONS.map(async section => [section, await listBands(db, school, section)] as const))
  return Object.fromEntries(entries) as Record<GradedSection, Awaited<ReturnType<typeof listBands>>>
}

export async function replaceGradingScale(db: Db, school: SchoolRef, section: GradedSection, bands: GradeBand[]) {
  await db.transaction(async (tx) => {
    await tx.delete(gradeBands).where(whereSchool(gradeBands, school, eq(gradeBands.section, section)))
    const ordered = [...bands].sort((a, b) => b.minScore - a.minScore)
    await tx.insert(gradeBands).values(ordered.map((band, i) => ({ ...band, schoolId: school.id, section, sortOrder: i })))
  })
  return listBands(db, school, section)
}
