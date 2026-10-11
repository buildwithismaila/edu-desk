import { type NewSchool, schools } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

let counter = 0

export async function createSchool(db: Db, overrides: Partial<NewSchool> = {}) {
  counter += 1
  const [school] = await db
    .insert(schools)
    .values({ slug: `test-school-${counter}`, name: `Test School ${counter}`, ...overrides })
    .returning()
  return school!
}

export async function createTwoSchools(db: Db) {
  const schoolA = await createSchool(db, { name: 'School A' })
  const schoolB = await createSchool(db, { name: 'School B' })
  return { schoolA, schoolB }
}
