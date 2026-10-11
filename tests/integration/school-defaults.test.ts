import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import { validateAssessmentComponents } from '~~/shared/utils/assessment'
import { validateGradeBands } from '~~/shared/utils/grading'
import { assessmentComponents, classLevels, departments, gradeBands } from '~~/server/database/schema'
import { applySchoolDefaults } from '~~/server/services/school-defaults'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createTestDb } from '../helpers/db'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

const levelsOf = (schoolId: string) =>
  db.select({ section: classLevels.section, name: classLevels.name }).from(classLevels).where(eq(classLevels.schoolId, schoolId)).orderBy(asc(classLevels.sortOrder))

const countRows = async (schoolId: string) => ({
  levels: (await db.select().from(classLevels).where(eq(classLevels.schoolId, schoolId))).length,
  departments: (await db.select().from(departments).where(eq(departments.schoolId, schoolId))).length,
  components: (await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolId))).length,
  bands: (await db.select().from(gradeBands).where(eq(gradeBands.schoolId, schoolId))).length,
})

describe('applySchoolDefaults', () => {
  it('creates the docs/domain.md class levels in order', async () => {
    const { schoolA } = await createTwoSchools(db)
    await applySchoolDefaults(db, schoolA.id)

    const levels = await levelsOf(schoolA.id)
    expect(levels.map(l => l.name)).toEqual([
      'Creche', 'Pre-Nursery', 'Nursery 1', 'Nursery 2',
      'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
      'JSS 1', 'JSS 2', 'JSS 3',
      'SSS 1', 'SSS 2', 'SSS 3',
    ])
    expect(levels.filter(l => l.section === 'jss').map(l => l.name)).toEqual(['JSS 1', 'JSS 2', 'JSS 3'])
  })

  it('creates departments, a valid assessment split and valid grading scales', async () => {
    const { schoolA } = await createTwoSchools(db)
    await applySchoolDefaults(db, schoolA.id)

    const depts = await db.select({ name: departments.name }).from(departments).where(eq(departments.schoolId, schoolA.id))
    expect(depts.map(d => d.name).sort()).toEqual(['Arts', 'Commercial', 'Science'])

    const components = await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolA.id)).orderBy(asc(assessmentComponents.sortOrder))
    expect(components.map(c => [c.name, c.maxScore])).toEqual([['CA1', 20], ['CA2', 20], ['Exam', 60]])
    expect(validateAssessmentComponents(components)).toEqual([])

    for (const section of ['primary', 'jss', 'sss'] as const) {
      const bands = await db.select().from(gradeBands).where(eq(gradeBands.schoolId, schoolA.id)).then(rows => rows.filter(b => b.section === section))
      expect(bands).toHaveLength(DEFAULT_GRADE_BANDS[section].length)
      expect(validateGradeBands(bands)).toEqual([])
    }
  })

  it('is idempotent', async () => {
    const { schoolA } = await createTwoSchools(db)
    await applySchoolDefaults(db, schoolA.id)
    const first = await countRows(schoolA.id)

    await applySchoolDefaults(db, schoolA.id)

    expect(await countRows(schoolA.id)).toEqual(first)
    expect(first).toEqual({ levels: 16, departments: 3, components: 3, bands: 6 + 6 + 9 })
  })

  it('does not overwrite a category the school has already changed', async () => {
    const { schoolA } = await createTwoSchools(db)
    await applySchoolDefaults(db, schoolA.id)
    await db.delete(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolA.id))
    await db.insert(assessmentComponents).values({ schoolId: schoolA.id, name: 'Exam', maxScore: 100, sortOrder: 0 })

    await applySchoolDefaults(db, schoolA.id)

    const components = await db.select({ name: assessmentComponents.name }).from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolA.id))
    expect(components).toEqual([{ name: 'Exam' }])
  })

  it('only touches the given school', async () => {
    const { schoolA, schoolB } = await createTwoSchools(db)
    await applySchoolDefaults(db, schoolA.id)

    expect(await countRows(schoolB.id)).toEqual({ levels: 0, departments: 0, components: 0, bands: 0 })
  })
})
