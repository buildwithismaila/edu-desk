import { and, eq } from 'drizzle-orm'
import {
  DEFAULT_ASSESSMENT_COMPONENTS,
  DEFAULT_CLASS_LEVELS,
  DEFAULT_DEPARTMENTS,
  DEFAULT_GRADE_BANDS,
  GRADED_SECTIONS,
} from '../../shared/constants/academics'
import { assessmentComponents, classLevels, departments, gradeBands } from '../database/schema'
import type { Db } from '../utils/db'

/**
 * Gives a school the docs/domain.md defaults: class levels, SSS departments, the CA1/CA2/Exam split
 * and grading scales. Each category is filled only if the school has none of it yet, so re-running
 * is safe and never overwrites a school's own changes. Used by the seed and (Phase 12) onboarding.
 */
export async function applySchoolDefaults(db: Db, schoolId: string) {
  await db.transaction(async (tx) => {
    const has = async (table: typeof classLevels | typeof departments | typeof assessmentComponents) =>
      (await tx.select({ id: table.id }).from(table).where(eq(table.schoolId, schoolId)).limit(1)).length > 0

    if (!await has(classLevels)) {
      const levels = DEFAULT_CLASS_LEVELS.flatMap(({ section, names }) => names.map(name => ({ section, name })))
      await tx.insert(classLevels).values(levels.map((level, i) => ({ ...level, schoolId, sortOrder: i })))
    }

    if (!await has(departments)) {
      await tx.insert(departments).values(DEFAULT_DEPARTMENTS.map(name => ({ schoolId, name })))
    }

    if (!await has(assessmentComponents)) {
      await tx.insert(assessmentComponents).values(DEFAULT_ASSESSMENT_COMPONENTS.map((c, i) => ({ ...c, schoolId, sortOrder: i })))
    }

    for (const section of GRADED_SECTIONS) {
      const existing = await tx.select({ id: gradeBands.id }).from(gradeBands)
        .where(and(eq(gradeBands.schoolId, schoolId), eq(gradeBands.section, section))).limit(1)
      if (existing.length) continue
      await tx.insert(gradeBands).values(DEFAULT_GRADE_BANDS[section].map((band, i) => ({ ...band, schoolId, section, sortOrder: i })))
    }
  })
}
