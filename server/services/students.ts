import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { Role } from '../../shared/constants/roles'
import { classArmLabel } from '../../shared/utils/academics'
import { defaultAdmissionPrefix, formatAdmissionNumber } from '../../shared/utils/admission-number'
import {
  admissionCounters,
  classArms,
  classLevels,
  classTeacherAssignments,
  departments,
  schools,
  studentEnrolments,
  studentGuardians,
  students,
  subjectTeacherAssignments,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { requireSession, resolveSession } from './assignments'
import { type GuardianInput, resolveGuardian, studentPhotoUrl } from './guardians'
import { latestPromotion } from './promotion'

type SchoolRef = { id: string }
export type Viewer = { id: string, role: Role }

type Bio = {
  firstName: string
  middleName: string | null
  lastName: string
  gender: 'male' | 'female'
  dateOfBirth: string | null
  stateOfOrigin: string | null
  lga: string | null
  address: string | null
  departmentId: string | null
}

const notFoundStudent = () => notFound('Student not found')

/**
 * The arms whose students a viewer can see in a session: null = all (admin, principal, bursar);
 * teachers only see arms they are class teacher of or teach a subject in.
 */
async function visibleArmIds(db: Db, school: SchoolRef, viewer: Viewer, sessionId: string | null): Promise<string[] | null> {
  if (viewer.role !== 'teacher') return null
  if (!sessionId) return []
  const where = (table: typeof classTeacherAssignments | typeof subjectTeacherAssignments) =>
    whereSchool(table, school, and(eq(table.sessionId, sessionId), eq(table.userId, viewer.id)))
  const classArmsTaught = await db.select({ id: classTeacherAssignments.classArmId }).from(classTeacherAssignments).where(where(classTeacherAssignments))
  const subjectArms = await db.select({ id: subjectTeacherAssignments.classArmId }).from(subjectTeacherAssignments).where(where(subjectTeacherAssignments))
  return [...new Set([...classArmsTaught, ...subjectArms].map(r => r.id))]
}

async function findArm(db: Db, school: SchoolRef, id: string) {
  const [arm] = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, eq(classArms.id, id)))
  if (!arm) throw fieldError('classArmId', 'Choose one of your class arms')
  return arm
}

/** A department must be the school's and only for SSS students. */
async function checkDepartment(db: Db, school: SchoolRef, departmentId: string | null, section: string | null) {
  if (!departmentId) return
  const [department] = await db.select({ id: departments.id }).from(departments).where(whereSchool(departments, school, eq(departments.id, departmentId)))
  if (!department) throw fieldError('departmentId', 'Choose one of your departments')
  if (section !== 'sss') throw fieldError('departmentId', 'Only SSS students have a department')
}

/**
 * Next free admission number for the school and year: increments the counter (inside the caller's
 * transaction, so a failed admission doesn't use a number) and skips numbers typed in manually.
 */
export async function nextAdmissionNumber(db: Db, school: SchoolRef, year: number) {
  const [row] = await db.select({ name: schools.name, prefix: schools.admissionPrefix }).from(schools).where(eq(schools.id, school.id))
  let prefix = row!.prefix
  if (!prefix) {
    prefix = defaultAdmissionPrefix(row!.name)
    await db.update(schools).set({ admissionPrefix: prefix }).where(eq(schools.id, school.id))
  }
  for (;;) {
    const [counter] = await db.insert(admissionCounters).values({ schoolId: school.id, year, lastNumber: 1 })
      .onConflictDoUpdate({ target: [admissionCounters.schoolId, admissionCounters.year], set: { lastNumber: sql`${admissionCounters.lastNumber} + 1` } })
      .returning({ lastNumber: admissionCounters.lastNumber })
    const candidate = formatAdmissionNumber(prefix, year, counter!.lastNumber)
    if (!await admissionNumberTaken(db, school, candidate)) return candidate
  }
}

async function admissionNumberTaken(db: Db, school: SchoolRef, admissionNumber: string) {
  const [taken] = await db.select({ id: students.id }).from(students)
    .where(whereSchool(students, school, sql`lower(${students.admissionNumber}) = lower(${admissionNumber})`))
  return !!taken
}

export interface AdmitInput extends Bio {
  classArmId: string
  admissionNumber: string | null
  sessionId?: string
  guardians: GuardianInput[]
}

/** Admission in one transaction: number, student, enrolment, guardians (new ones get a temporary password). */
export async function admitStudent(db: Db, school: SchoolRef, input: AdmitInput) {
  const session = await requireSession(db, school, input.sessionId)
  const arm = await findArm(db, school, input.classArmId)
  await checkDepartment(db, school, input.departmentId, arm.section)

  const { studentId, newGuardians } = await db.transaction(async (tx) => {
    let admissionNumber = input.admissionNumber
    if (admissionNumber) {
      if (await admissionNumberTaken(tx, school, admissionNumber)) throw conflict(`Admission number ${admissionNumber} is already used`)
    }
    else {
      admissionNumber = await nextAdmissionNumber(tx, school, Number(session.name.slice(0, 4)))
    }

    const { classArmId: _arm, sessionId: _session, guardians, admissionNumber: _number, ...bio } = input
    const [student] = await tx.insert(students).values({ ...bio, schoolId: school.id, admissionNumber }).returning({ id: students.id })
    await tx.insert(studentEnrolments).values({ schoolId: school.id, sessionId: session.id, studentId: student!.id, classArmId: arm.id })

    const created: { id: string, name: string, temporaryPassword: string }[] = []
    for (const [i, guardianInput] of guardians.entries()) {
      const { guardian, temporaryPassword } = await resolveGuardian(tx, school, guardianInput)
      await tx.insert(studentGuardians).values({ schoolId: school.id, studentId: student!.id, guardianId: guardian.id, relationship: guardianInput.relationship, isPrimary: i === 0 })
      if (temporaryPassword) created.push({ id: guardian.id, name: guardian.name, temporaryPassword })
    }
    return { studentId: student!.id, newGuardians: created }
  })

  return { student: await getStudent(db, school, studentId), newGuardians }
}

export interface ListQuery {
  page: number
  pageSize: number
  search?: string
  classLevelId?: string
  classArmId?: string
  gender?: 'male' | 'female'
  sessionId?: string
}

/** Paginated, searchable list of the students the viewer may see, with their class in the session. */
export async function listStudents(db: Db, school: SchoolRef, viewer: Viewer, query: ListQuery) {
  const session = await resolveSession(db, school, query.sessionId)
  if (query.sessionId && !session) throw notFound('Session not found')
  const sessionId = session?.id ?? null
  const armIds = await visibleArmIds(db, school, viewer, sessionId)
  const empty = { items: [], total: 0, page: query.page, pageSize: query.pageSize }
  if (armIds && !armIds.length) return empty

  const term = query.search ? `%${query.search}%` : null
  const conditions: (SQL | undefined)[] = [
    isNull(students.deletedAt),
    term
      ? or(
          ilike(students.admissionNumber, term),
          ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, term),
          ilike(sql`${students.lastName} || ' ' || ${students.firstName}`, term),
          ilike(students.middleName, term),
        )
      : undefined,
    query.gender ? eq(students.gender, query.gender) : undefined,
    query.classArmId ? eq(studentEnrolments.classArmId, query.classArmId) : undefined,
    query.classLevelId ? eq(classArms.classLevelId, query.classLevelId) : undefined,
    armIds ? inArray(studentEnrolments.classArmId, armIds) : undefined,
    // With a session (current or chosen), only the students enrolled in it; with none, everyone
    sessionId ? sql`${studentEnrolments.id} is not null` : undefined,
  ]
  const where = whereSchool(students, school, ...conditions)
  const enrolmentJoin = and(eq(studentEnrolments.studentId, students.id), sessionId ? eq(studentEnrolments.sessionId, sessionId) : sql`false`)

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(students)
    .leftJoin(studentEnrolments, enrolmentJoin)
    .leftJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .where(where)

  const rows = await db.select({
    id: students.id,
    admissionNumber: students.admissionNumber,
    firstName: students.firstName,
    middleName: students.middleName,
    lastName: students.lastName,
    gender: students.gender,
    photoKey: students.photoKey,
    photoUpdatedAt: students.photoUpdatedAt,
    classArmId: classArms.id,
    arm: classArms.name,
    level: classLevels.name,
  })
    .from(students)
    .leftJoin(studentEnrolments, enrolmentJoin)
    .leftJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .leftJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(where)
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.admissionNumber))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  return {
    items: rows.map(({ photoKey, photoUpdatedAt, arm, level, ...row }) => ({
      ...row,
      classLabel: arm && level ? classArmLabel(level, arm) : null,
      photoUrl: studentPhotoUrl({ id: row.id, photoKey, photoUpdatedAt }),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

/**
 * Whether the viewer may see this (non-removed) student: staff by role/arms, parents if it's their child.
 * Throws 404 otherwise, so a student's existence isn't revealed.
 */
export async function assertCanSeeStudent(db: Db, school: SchoolRef, viewer: Viewer, studentId: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(whereSchool(students, school, eq(students.id, studentId), isNull(students.deletedAt)))
  if (!student) throw notFoundStudent()

  if (viewer.role === 'parent') {
    const [link] = await db.select({ id: studentGuardians.id }).from(studentGuardians)
      .where(whereSchool(studentGuardians, school, and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, viewer.id))))
    if (!link) throw notFoundStudent()
    return
  }
  const session = await resolveSession(db, school)
  const armIds = await visibleArmIds(db, school, viewer, session?.id ?? null)
  if (!armIds) return
  const [enrolled] = armIds.length
    ? await db.select({ id: studentEnrolments.id }).from(studentEnrolments)
        .where(whereSchool(studentEnrolments, school, and(eq(studentEnrolments.studentId, studentId), eq(studentEnrolments.sessionId, session!.id), inArray(studentEnrolments.classArmId, armIds))))
    : []
  if (!enrolled) throw notFoundStudent()
}

/**
 * The profile: bio (personal fields hidden from the bursar), current enrolment, department, guardians.
 * No access check: routes call assertCanSeeStudent first.
 */
export async function getStudent(db: Db, school: SchoolRef, id: string, role: Role = 'admin') {
  const [student] = await db.select().from(students).where(whereSchool(students, school, eq(students.id, id), isNull(students.deletedAt)))
  if (!student) throw notFoundStudent()

  const session = await resolveSession(db, school)
  const [enrolment] = session
    ? await db.select({ sessionId: studentEnrolments.sessionId, classArmId: classArms.id, arm: classArms.name, level: classLevels.name, section: classLevels.section })
        .from(studentEnrolments)
        .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
        .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
        .where(whereSchool(studentEnrolments, school, and(eq(studentEnrolments.studentId, id), eq(studentEnrolments.sessionId, session.id))))
    : []
  const [department] = student.departmentId
    ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.id, student.departmentId))
    : []
  const guardians = await db.select({
    id: users.id,
    name: users.name,
    phone: users.phone,
    email: users.email,
    relationship: studentGuardians.relationship,
    isPrimary: studentGuardians.isPrimary,
  })
    .from(studentGuardians).innerJoin(users, eq(studentGuardians.guardianId, users.id))
    .where(whereSchool(studentGuardians, school, eq(studentGuardians.studentId, id)))
    .orderBy(sql`${studentGuardians.isPrimary} desc`, asc(users.name))

  const { schoolId: _school, photoKey: _photo, photoUpdatedAt: _photoAt, deletedAt: _deleted, createdAt: _created, updatedAt: _updated, ...bio } = student
  const profile = {
    ...bio,
    department: department ?? null,
    enrolment: enrolment
      ? { sessionId: enrolment.sessionId, sessionName: session!.name, classArmId: enrolment.classArmId, label: classArmLabel(enrolment.level, enrolment.arm), section: enrolment.section }
      : null,
    guardians,
    photoUrl: studentPhotoUrl(student),
    // End-of-session outcome (Phase 10): graduated / withdrawn, or the class for next session
    promotion: await latestPromotion(db, school, id),
  }
  if (role !== 'bursar') return profile
  // The bursar doesn't see personal details (NDPA: restrict personal data by role)
  const { dateOfBirth: _dob, stateOfOrigin: _state, lga: _lga, address: _address, ...forBursar } = profile
  return forBursar
}

/** Bio fields and department; a department is only allowed while the student is in an SSS arm. */
export async function updateStudent(db: Db, school: SchoolRef, id: string, changes: Partial<Bio>) {
  const current = await getStudent(db, school, id)
  if (changes.departmentId !== undefined) await checkDepartment(db, school, changes.departmentId, current.enrolment?.section ?? null)
  await db.update(students).set(changes).where(whereSchool(students, school, eq(students.id, id)))
  return getStudent(db, school, id)
}

/** Sets the student's arm for the session (default current); leaving SSS clears the department. */
export async function setEnrolment(db: Db, school: SchoolRef, id: string, input: { classArmId: string, sessionId?: string }) {
  await getStudent(db, school, id)
  const session = await requireSession(db, school, input.sessionId)
  const arm = await findArm(db, school, input.classArmId)

  await db.transaction(async (tx) => {
    await tx.insert(studentEnrolments).values({ schoolId: school.id, sessionId: session.id, studentId: id, classArmId: arm.id })
      .onConflictDoUpdate({ target: [studentEnrolments.schoolId, studentEnrolments.sessionId, studentEnrolments.studentId], set: { classArmId: arm.id, updatedAt: new Date() } })
    if (arm.section !== 'sss') await tx.update(students).set({ departmentId: null }).where(whereSchool(students, school, eq(students.id, id)))
  })
  return getStudent(db, school, id)
}

/** Soft delete for students who left: hidden everywhere; admission number, enrolments and guardians kept. */
export async function removeStudent(db: Db, school: SchoolRef, id: string) {
  await getStudent(db, school, id)
  await db.update(students).set({ deletedAt: new Date() }).where(whereSchool(students, school, eq(students.id, id)))
}
