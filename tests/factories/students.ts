import { type NewStudent, type School, studentEnrolments, studentGuardians, students, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { hashPassword } from '../helpers/nitro-imports'
import { DEFAULT_TEST_PASSWORD } from './users'

type SchoolRef = Pick<School, 'id'>

let counter = 0
const next = () => ++counter

/** A parent account (role parent) with a unique phone; email optional. */
export async function createGuardian(db: Db, school: SchoolRef, overrides: { name?: string, phone?: string, email?: string | null, isActive?: boolean } = {}) {
  const n = next()
  const [guardian] = await db.insert(users).values({
    schoolId: school.id,
    role: 'parent',
    name: overrides.name ?? `Guardian ${n}`,
    phone: overrides.phone ?? `+23481${String(n).padStart(8, '0')}`,
    email: overrides.email === undefined ? `guardian${n}@example.test` : overrides.email,
    isActive: overrides.isActive ?? true,
    passwordHash: await hashPassword(DEFAULT_TEST_PASSWORD),
  }).returning()
  return guardian!
}

type StudentOverrides = Partial<Omit<NewStudent, 'schoolId'>> & { guardians?: { id: string }[] }

/** A student (no enrolment unless you call enrol), optionally linked to guardians. */
export async function createStudent(db: Db, school: SchoolRef, { guardians = [], ...overrides }: StudentOverrides = {}) {
  const n = next()
  const [student] = await db.insert(students).values({
    schoolId: school.id,
    admissionNumber: `TST/2026/${String(n).padStart(4, '0')}`,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    gender: n % 2 ? 'female' : 'male',
    ...overrides,
  }).returning()
  for (const [i, guardian] of guardians.entries()) {
    await db.insert(studentGuardians).values({ schoolId: school.id, studentId: student!.id, guardianId: guardian.id, relationship: 'guardian', isPrimary: i === 0 })
  }
  return student!
}

export async function enrol(db: Db, school: SchoolRef, { student, session, arm }: { student: { id: string }, session: { id: string }, arm: { id: string } }) {
  const [row] = await db.insert(studentEnrolments)
    .values({ schoolId: school.id, studentId: student.id, sessionId: session.id, classArmId: arm.id }).returning()
  return row!
}
