import { z } from 'zod'
import { normalisePhone } from '../../shared/utils/phone'
import { schoolSlugError } from '../../shared/utils/school-slug'
import { schools, users } from '../database/schema'
import type { Db } from '../utils/db'
import { isUniqueViolation } from '../utils/errors'
import { generateTemporaryPassword } from '../utils/password'
import { hashPasswordScrypt } from '../utils/scrypt-hash'
import { applySchoolDefaults } from './school-defaults'

// Creating a school for a pilot (docs/features/10a-pilot-readiness.md), run on the server with
// `pnpm school:create`. Phase 12 adds self-serve signup on top of this.

const inputSchema = z.object({
  slug: z.string(),
  name: z.string().trim().min(2, 'School name: at least 2 characters').max(120),
  admin: z.object({
    name: z.string().trim().min(2, 'Admin name: at least 2 characters').max(120),
    email: z.email('Admin email: enter a valid email address').transform(e => e.toLowerCase()),
    phone: z.string().nullish(),
  }),
})
export type CreateSchoolInput = z.input<typeof inputSchema>

/**
 * One transaction: the school, its defaults (class levels, departments, assessment split, grading) and its first
 * admin with a temporary password they must change at first login. Throws (nothing created) on a reserved,
 * malformed or taken slug, or bad admin details.
 */
export async function createSchoolWithAdmin(db: Db, raw: CreateSchoolInput, hash: (password: string) => Promise<string> = hashPasswordScrypt) {
  const slug = raw.slug.trim().toLowerCase()
  const slugProblem = schoolSlugError(slug)
  if (slugProblem) throw new Error(slugProblem)
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => i.message).join('; '))
  const { name, admin } = parsed.data
  const phone = admin.phone ? normalisePhone(admin.phone) : null
  if (admin.phone && !phone) throw new Error('Admin phone: enter a Nigerian number, e.g. 08031234567')

  const temporaryPassword = generateTemporaryPassword()
  try {
    return await db.transaction(async (tx) => {
      const [school] = await tx.insert(schools).values({ slug, name }).returning()
      await applySchoolDefaults(tx, school!.id)
      const [user] = await tx.insert(users).values({
        schoolId: school!.id,
        role: 'admin',
        name: admin.name,
        email: admin.email,
        phone,
        passwordHash: await hash(temporaryPassword),
        mustChangePassword: true,
      }).returning({ id: users.id, name: users.name, email: users.email })
      return { school: school!, admin: user!, temporaryPassword }
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new Error(`A school called "${slug}" already exists`, { cause: error })
    throw error
  }
}
