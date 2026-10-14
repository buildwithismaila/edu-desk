import { and, eq, sql } from 'drizzle-orm'
import { formatAdmissionNumber } from '../../../shared/utils/admission-number'
import {
  admissionCounters,
  classArms,
  classLevels,
  departments,
  schools,
  studentEnrolments,
  studentGuardians,
  students,
  users,
} from '../schema'
import type { Db } from '../../utils/db'
import { DEMO_PASSWORD_HASH } from './demo-password'

type Gender = 'male' | 'female'
type Relationship = 'father' | 'mother' | 'guardian' | 'other'

/** A guardian: matched by phone (an existing demo user can be referenced by email). */
interface DemoGuardian { name: string, phone: string, email: string | null, relationship: Relationship }

interface DemoStudent {
  first: string
  last: string
  gender: Gender
  state: string
  /** Arm label, e.g. "JSS 1A" */
  arm: string
  /** SSS only */
  department?: string
  /** Defaults to one guardian generated from the surname */
  guardians?: DemoGuardian[]
}

export interface DemoStudents {
  prefix: string
  year: number
  list: DemoStudent[]
}

const ezeMother: DemoGuardian = { name: 'Ngozi Eze', phone: '+2348031110001', email: 'parent@greenfield.test', relationship: 'mother' }
const belloFather: DemoGuardian = { name: 'Sani Bello', phone: '+2348022000001', email: null, relationship: 'father' }
const adeyemiParents: DemoGuardian[] = [
  { name: 'Kunle Adeyemi', phone: '+2348022000002', email: 'kunle.adeyemi@mail.test', relationship: 'father' },
  { name: 'Funmi Adeyemi', phone: '+2348022000003', email: null, relationship: 'mother' },
]

const s = (first: string, last: string, gender: Gender, state: string, arm: string, extra: Partial<DemoStudent> = {}): DemoStudent =>
  ({ first, last, gender, state, arm, ...extra })

export const GREENFIELD_STUDENTS: DemoStudents = {
  prefix: 'GFA',
  year: 2026,
  list: [
    // JSS 1A (10) — Chidera and Somto Eze (Primary 3A) are siblings
    s('Chidera', 'Eze', 'female', 'Anambra', 'JSS 1A', { guardians: [ezeMother] }),
    s('Tobi', 'Adebayo', 'male', 'Oyo', 'JSS 1A'),
    s('Fatima', 'Usman', 'female', 'Kano', 'JSS 1A'),
    s('Emeka', 'Okonkwo', 'male', 'Enugu', 'JSS 1A'),
    s('Zainab', 'Lawal', 'female', 'Kwara', 'JSS 1A'),
    s('Ifeanyi', 'Nwachukwu', 'male', 'Imo', 'JSS 1A'),
    s('Bisola', 'Ogunleye', 'female', 'Ogun', 'JSS 1A'),
    s('Uche', 'Okafor', 'male', 'Anambra', 'JSS 1A'),
    s('Halima', 'Abubakar', 'female', 'Bauchi', 'JSS 1A'),
    s('Daniel', 'Etim', 'male', 'Akwa Ibom', 'JSS 1A'),
    // JSS 1B (8) — Aisha and Musa Bello (Nursery 1A) are siblings
    s('Aisha', 'Bello', 'female', 'Kaduna', 'JSS 1B', { guardians: [belloFather] }),
    s('Samuel', 'Johnson', 'male', 'Lagos', 'JSS 1B'),
    s('Grace', 'Okoro', 'female', 'Ebonyi', 'JSS 1B'),
    s('Ibrahim', 'Yusuf', 'male', 'Niger', 'JSS 1B'),
    s('Chiamaka', 'Obi', 'female', 'Delta', 'JSS 1B'),
    s('Kelechi', 'Uzo', 'male', 'Abia', 'JSS 1B'),
    s('Rukayat', 'Salami', 'female', 'Osun', 'JSS 1B'),
    s('Peter', 'Adeleke', 'male', 'Ekiti', 'JSS 1B'),
    // Primary 3A (8)
    s('Somto', 'Eze', 'male', 'Anambra', 'Primary 3A', { guardians: [ezeMother] }),
    s('Ade', 'Bakare', 'male', 'Lagos', 'Primary 3A'),
    s('Amina', 'Garba', 'female', 'Jigawa', 'Primary 3A'),
    s('Ebuka', 'Nnaji', 'male', 'Enugu', 'Primary 3A'),
    s('Precious', 'Akpan', 'female', 'Akwa Ibom', 'Primary 3A'),
    s('Yusuf', 'Danjuma', 'male', 'Plateau', 'Primary 3A'),
    s('Tiwa', 'Afolabi', 'female', 'Ondo', 'Primary 3A'),
    s('Musa', 'Idris', 'male', 'Sokoto', 'Primary 3A'),
    // SSS 1A (8) — Tolu Adeyemi has two guardians
    s('Tolu', 'Adeyemi', 'female', 'Oyo', 'SSS 1A', { department: 'Science', guardians: adeyemiParents }),
    s('Ngozi', 'Ibe', 'female', 'Imo', 'SSS 1A', { department: 'Science' }),
    s('Abdul', 'Kareem', 'male', 'Kogi', 'SSS 1A', { department: 'Science' }),
    s('Funke', 'Ajayi', 'female', 'Ekiti', 'SSS 1A', { department: 'Arts' }),
    s('Efe', 'Omoregie', 'male', 'Edo', 'SSS 1A', { department: 'Arts' }),
    s('Blessing', 'Udo', 'female', 'Cross River', 'SSS 1A', { department: 'Arts' }),
    s('Kunle', 'Ogundipe', 'male', 'Ogun', 'SSS 1A', { department: 'Commercial' }),
    s('Hauwa', 'Mohammed', 'female', 'Borno', 'SSS 1A', { department: 'Commercial' }),
    // Nursery 1A (6)
    s('Musa', 'Bello', 'male', 'Kaduna', 'Nursery 1A', { guardians: [belloFather] }),
    s('Ada', 'Nwosu', 'female', 'Anambra', 'Nursery 1A'),
    s('David', 'Okeke', 'male', 'Rivers', 'Nursery 1A'),
    s('Joy', 'Edet', 'female', 'Cross River', 'Nursery 1A'),
    s('Ahmed', 'Shehu', 'male', 'Katsina', 'Nursery 1A'),
    s('Mary', 'Ojo', 'female', 'Kogi', 'Nursery 1A'),
    // SSS 3A (3): the last class, so promotion graduates them by default (Phase 10)
    s('Chinedu', 'Okafor', 'male', 'Anambra', 'SSS 3A', { department: 'Science' }),
    s('Zainab', 'Lawal', 'female', 'Kwara', 'SSS 3A', { department: 'Arts' }),
    s('Segun', 'Oladipo', 'male', 'Osun', 'SSS 3A', { department: 'Commercial' }),
  ],
}

export const SUNRISE_STUDENTS: DemoStudents = {
  prefix: 'SUN',
  year: 2026,
  list: [
    s('Ireti', 'Bankole', 'female', 'Lagos', 'JSS 1 Gold', { guardians: [{ name: 'Yemi Bankole', phone: '+2348033000001', email: null, relationship: 'mother' }] }),
    s('Nnamdi', 'Agu', 'male', 'Enugu', 'JSS 1 Gold', { guardians: [{ name: 'Obinna Agu', phone: '+2348033000002', email: null, relationship: 'father' }] }),
    s('Salma', 'Aliyu', 'female', 'Kano', 'JSS 1 Gold', { guardians: [{ name: 'Aliyu Musa', phone: '+2348033000003', email: null, relationship: 'father' }] }),
  ],
}

/** Birth year by class, so ages look right on the demo. */
const BIRTH_YEAR: Record<string, number> = { 'Nursery 1A': 2022, 'Primary 3A': 2018, 'JSS 1A': 2014, 'JSS 1B': 2014, 'SSS 1A': 2011, 'SSS 3A': 2009, 'JSS 1 Gold': 2014 }

/** Default guardian from the surname: alternating mother/father, phone sequential, every third phone-only. */
function defaultGuardian(student: DemoStudent, n: number, phoneBase: string): DemoGuardian {
  const mother = n % 2 === 0
  return {
    name: `${mother ? 'Mrs' : 'Mr'} ${student.last}`,
    phone: `${phoneBase}${String(n).padStart(4, '0')}`,
    email: n % 3 === 0 ? null : `${student.last.toLowerCase()}.family${n}@mail.test`,
    relationship: mother ? 'mother' : 'father',
  }
}

/** Upserts a parent account by phone (or by email for an existing demo user). */
async function upsertGuardian(db: Db, schoolId: string, guardian: DemoGuardian) {
  const [byPhone] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.phone, guardian.phone)))
  const [byEmail] = guardian.email
    ? await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, guardian.email)))
    : []
  const existing = byPhone ?? byEmail
  if (existing) {
    await db.update(users).set({ name: guardian.name, phone: guardian.phone, email: guardian.email, role: 'parent', isActive: true, deletedAt: null })
      .where(eq(users.id, existing.id))
    return existing.id
  }
  const [created] = await db.insert(users).values({
    schoolId,
    role: 'parent',
    name: guardian.name,
    phone: guardian.phone,
    email: guardian.email,
    passwordHash: DEMO_PASSWORD_HASH,
  }).returning({ id: users.id })
  return created!.id
}

/** Idempotent: upserts students by admission number, their enrolment in the session, and guardian links. */
export async function seedStudents(db: Db, schoolId: string, sessionId: string, demo: DemoStudents, phoneBase: string) {
  await db.update(schools).set({ admissionPrefix: demo.prefix }).where(eq(schools.id, schoolId))

  const arms = await db.select({ id: classArms.id, arm: classArms.name, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))
  const armId = (label: string) => arms.find(a => `${a.level}${a.arm}` === label || `${a.level} ${a.arm}` === label)!.id
  const depts = await db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.schoolId, schoolId))

  for (const [i, student] of demo.list.entries()) {
    const seq = i + 1
    const birthYear = BIRTH_YEAR[student.arm] ?? 2014
    const [row] = await db.insert(students).values({
      schoolId,
      admissionNumber: formatAdmissionNumber(demo.prefix, demo.year, seq),
      firstName: student.first,
      lastName: student.last,
      gender: student.gender,
      dateOfBirth: `${birthYear}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      stateOfOrigin: student.state,
      departmentId: student.department ? depts.find(d => d.name === student.department)!.id : null,
      admittedOn: `${demo.year}-09-14`,
    }).onConflictDoUpdate({
      target: [students.schoolId, students.admissionNumber],
      set: {
        firstName: sql`excluded.first_name`,
        lastName: sql`excluded.last_name`,
        gender: sql`excluded.gender`,
        departmentId: sql`excluded.department_id`,
        deletedAt: null,
        updatedAt: sql`now()`,
      },
    }).returning({ id: students.id })

    await db.insert(studentEnrolments).values({ schoolId, sessionId, studentId: row!.id, classArmId: armId(student.arm) })
      .onConflictDoUpdate({ target: [studentEnrolments.schoolId, studentEnrolments.sessionId, studentEnrolments.studentId], set: { classArmId: sql`excluded.class_arm_id` } })

    const guardians = student.guardians ?? [defaultGuardian(student, seq, phoneBase)]
    for (const [g, guardian] of guardians.entries()) {
      const guardianId = await upsertGuardian(db, schoolId, guardian)
      await db.insert(studentGuardians).values({ schoolId, studentId: row!.id, guardianId, relationship: guardian.relationship, isPrimary: g === 0 })
        .onConflictDoNothing()
    }
  }

  await db.insert(admissionCounters).values({ schoolId, year: demo.year, lastNumber: demo.list.length })
    .onConflictDoUpdate({
      target: [admissionCounters.schoolId, admissionCounters.year],
      set: { lastNumber: sql`greatest(${admissionCounters.lastNumber}, excluded.last_number)` },
    })
}
