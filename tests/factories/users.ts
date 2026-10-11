import { type NewUser, type School, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { hashPassword } from '../helpers/nitro-imports'

export const DEFAULT_TEST_PASSWORD = 'password123'

let counter = 0

type UserOverrides = Partial<Omit<NewUser, 'schoolId' | 'passwordHash'>> & { password?: string }

/** A user in `school`, with a real scrypt hash of `password` (default `password123`). */
export async function createUser(db: Db, school: Pick<School, 'id'>, { password = DEFAULT_TEST_PASSWORD, ...overrides }: UserOverrides = {}) {
  counter += 1
  const [user] = await db
    .insert(users)
    .values({
      email: `user${counter}@example.test`,
      name: `Test User ${counter}`,
      role: 'teacher',
      ...overrides,
      schoolId: school.id,
      passwordHash: await hashPassword(password),
    })
    .returning()
  return user!
}
