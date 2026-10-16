import { asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { SECTIONS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import type { AttendanceStatus } from '../../shared/schemas/attendance'
import { classArmLabel } from '../../shared/utils/academics'
import { registerDateError, summariseAttendance } from '../../shared/utils/attendance'
import {
  attendanceMarks,
  attendanceRegisters,
  classArms,
  classLevels,
  classTeacherAssignments,
  studentEnrolments,
  students,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { getCurrentTerm } from './calendar'
import { studentPhotoUrl } from './guardians'
import { resolveTerm } from './terms'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }

const forbidden = () => createError({
  statusCode: 403,
  statusMessage: 'Forbidden',
  message: 'Only the class teacher, the principal or an admin can take this class\'s register',
})

async function findArm(db: Db, school: SchoolRef, id: string) {
  const [arm] = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, eq(classArms.id, id)))
  if (!arm) throw notFound('Class not found')
  return { id: arm.id, label: classArmLabel(arm.level, arm.name) }
}

async function isClassTeacher(db: Db, school: SchoolRef, userId: string, sessionId: string, armId: string) {
  const [row] = await db.select({ id: classTeacherAssignments.id }).from(classTeacherAssignments)
    .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, sessionId), eq(classTeacherAssignments.classArmId, armId), eq(classTeacherAssignments.userId, userId)))
  return !!row
}

/**
 * The arm and current term for a register, after checking who's asking: admin and principal (any arm,
 * can back-fill) or the arm's class teacher this session (today only). 404 unknown arm, 403 anyone else,
 * 400 without a current term.
 */
async function authoriseRegister(db: Db, school: SchoolRef, viewer: Viewer, armId: string) {
  const arm = await findArm(db, school, armId)
  const { session, term } = await getCurrentTerm(db, school)
  const canBackfill = viewer.role === 'admin' || viewer.role === 'principal'
  if (!canBackfill && (viewer.role !== 'teacher' || !session || !await isClassTeacher(db, school, viewer.id, session.id, arm.id))) {
    throw forbidden()
  }
  if (!session || !term) throw fieldError('term', 'Set a current term first')
  return { arm, session, term, canBackfill }
}

/** Active students enrolled in the arm for the session, by surname. */
async function roster(db: Db, school: SchoolRef, sessionId: string, armId: string) {
  const rows = await db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    photoKey: students.photoKey,
    photoUpdatedAt: students.photoUpdatedAt,
  })
    .from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, sessionId), eq(studentEnrolments.classArmId, armId), isNull(students.deletedAt)))
    .orderBy(asc(students.lastName), asc(students.firstName))
  return rows.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNumber: s.admissionNumber, photoUrl: studentPhotoUrl(s) }))
}

async function findRegister(db: Db, school: SchoolRef, armId: string, date: string) {
  const [register] = await db.select({ id: attendanceRegisters.id, takenBy: users.name, updatedAt: attendanceRegisters.updatedAt, version: attendanceRegisters.version, sentLateAt: attendanceRegisters.sentLateAt })
    .from(attendanceRegisters)
    .leftJoin(users, eq(attendanceRegisters.takenById, users.id))
    .where(whereSchool(attendanceRegisters, school, eq(attendanceRegisters.classArmId, armId), eq(attendanceRegisters.date, date)))
  return register ?? null
}

/** The arms the viewer takes registers for (current session), with their size and whether today's is taken. */
export async function listAttendanceArms(db: Db, school: SchoolRef, viewer: Viewer, today: string) {
  const { session } = await getCurrentTerm(db, school)
  if (!session) return { today, arms: [] }

  const own = viewer.role === 'teacher'
    ? (await db.select({ id: classTeacherAssignments.classArmId }).from(classTeacherAssignments)
        .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, session.id), eq(classTeacherAssignments.userId, viewer.id)))).map(r => r.id)
    : null
  if (own && !own.length) return { today, arms: [] }

  const arms = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, own ? inArray(classArms.id, own) : undefined))
  const ids = arms.map(a => a.id)
  if (!ids.length) return { today, arms: [] }

  const sizes = await db.select({ armId: studentEnrolments.classArmId, students: count() })
    .from(studentEnrolments).innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, session.id), inArray(studentEnrolments.classArmId, ids), isNull(students.deletedAt)))
    .groupBy(studentEnrolments.classArmId)
  const taken = await db.select({ armId: attendanceRegisters.classArmId }).from(attendanceRegisters)
    .where(whereSchool(attendanceRegisters, school, eq(attendanceRegisters.date, today), inArray(attendanceRegisters.classArmId, ids)))

  return {
    today,
    arms: arms
      .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(a => ({
        id: a.id,
        label: classArmLabel(a.level, a.name),
        students: sizes.find(s => s.armId === a.id)?.students ?? 0,
        taken: taken.some(t => t.armId === a.id),
      })),
  }
}

/** The register for an arm and date (any past date can be viewed; editing follows the date rules). */
export async function getRegister(db: Db, school: SchoolRef, viewer: Viewer, armId: string, date: string, today: string) {
  const { arm, session, term, canBackfill } = await authoriseRegister(db, school, viewer, armId)
  if (date > today) throw fieldError('date', 'That date is in the future')

  const register = await findRegister(db, school, arm.id, date)
  const marks = register
    ? await db.select({ studentId: attendanceMarks.studentId, status: attendanceMarks.status }).from(attendanceMarks)
        .where(whereSchool(attendanceMarks, school, eq(attendanceMarks.registerId, register.id)))
    : []
  const statusOf = new Map(marks.map(m => [m.studentId, m.status]))

  return {
    date,
    arm,
    term: { id: term.id, number: term.number, startsOn: term.startsOn, endsOn: term.endsOn },
    register,
    canEdit: registerDateError({ date, today, term, canBackfill }) === null,
    students: (await roster(db, school, session.id, arm.id)).map(s => ({ ...s, status: (statusOf.get(s.id) ?? null) as AttendanceStatus | null })),
  }
}

/**
 * Saves a complete register (every active student in the arm, once) in one transaction. Created once per
 * arm and day (DB-unique; a concurrent first save becomes an update). Returns whether it was created.
 */
export async function saveRegister(
  db: Db,
  school: SchoolRef,
  viewer: Viewer,
  input: { classArmId: string, date: string, marks: { studentId: string, status: AttendanceStatus }[], offline?: { baseVersion: number | null } },
  today: string,
) {
  const { arm, session, term, canBackfill } = await authoriseRegister(db, school, viewer, input.classArmId)
  const offline = input.offline
  const dateError = registerDateError({ date: input.date, today, term, canBackfill, offline: !!offline })
  if (dateError) throw fieldError('date', dateError)

  const students = await roster(db, school, session.id, arm.id)
  const inArm = new Set(students.map(s => s.id))
  if (input.marks.some(m => !inArm.has(m.studentId))) throw fieldError('marks', 'Some students aren\'t in this class')
  const marked = new Set(input.marks.map(m => m.studentId))
  const missing = students.filter(s => !marked.has(s.id)).map(s => s.name)
  if (missing.length) throw fieldError('marks', `Mark every student: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing`)

  // Taken offline and arriving after its day: labelled "Sent late (offline)"
  const sentLateAt = offline && input.date < today ? new Date() : null
  const result = await db.transaction(async (tx) => {
    // An offline copy is only written if the school's register is still the version the phone saw (none,
    // or the same version); checked in the same statements as the write, so two arrivals can't both win
    const [inserted] = !offline || offline.baseVersion === null
      ? await tx.insert(attendanceRegisters)
          .values({ schoolId: school.id, termId: term.id, classArmId: arm.id, date: input.date, takenById: viewer.id, sentLateAt })
          .onConflictDoNothing()
          .returning({ id: attendanceRegisters.id })
      : []
    let registerId = inserted?.id
    if (!registerId) {
      if (offline && offline.baseVersion === null) return 'conflict' as const
      const [existing] = await tx.update(attendanceRegisters)
        .set({ takenById: viewer.id, version: sql`${attendanceRegisters.version} + 1`, ...(offline ? { sentLateAt } : {}) })
        .where(whereSchool(attendanceRegisters, school,
          eq(attendanceRegisters.classArmId, arm.id),
          eq(attendanceRegisters.date, input.date),
          offline ? eq(attendanceRegisters.version, offline.baseVersion!) : undefined))
        .returning({ id: attendanceRegisters.id })
      if (!existing) return 'conflict' as const
      registerId = existing.id
    }
    await tx.insert(attendanceMarks)
      .values(input.marks.map(m => ({ schoolId: school.id, registerId: registerId!, studentId: m.studentId, status: m.status })))
      .onConflictDoUpdate({
        target: [attendanceMarks.schoolId, attendanceMarks.registerId, attendanceMarks.studentId],
        set: { status: sql`excluded.status`, updatedAt: new Date() },
      })
    return inserted ? 'created' as const : 'updated' as const
  })

  if (result === 'conflict') {
    // The school's copy wins: the phone gets it back to show the teacher both
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'This register was changed at school after your phone saved it',
      data: { register: await getRegister(db, school, viewer, arm.id, input.date, today) },
    })
  }
  return { created: result === 'created', register: await getRegister(db, school, viewer, arm.id, input.date, today) }
}

/** Admin/principal: delete a register taken by mistake (its marks go with it). */
export async function deleteRegister(db: Db, school: SchoolRef, id: string) {
  const [register] = await db.delete(attendanceRegisters).where(whereSchool(attendanceRegisters, school, eq(attendanceRegisters.id, id)))
    .returning({ id: attendanceRegisters.id })
  if (!register) throw notFound('Register not found')
}

/** Every mark of these students in the term's registers (any arm, so a mid-term move counts both). */
async function termMarks(db: Db, school: SchoolRef, termId: string, studentIds: string[]) {
  if (!studentIds.length) return []
  return db.select({ studentId: attendanceMarks.studentId, status: attendanceMarks.status, date: attendanceRegisters.date })
    .from(attendanceMarks)
    .innerJoin(attendanceRegisters, eq(attendanceMarks.registerId, attendanceRegisters.id))
    .where(whereSchool(attendanceMarks, school, eq(attendanceRegisters.termId, termId), inArray(attendanceMarks.studentId, studentIds)))
    .orderBy(asc(attendanceRegisters.date))
}

/** Term summary per active student in the arm: admin, principal or the arm's class teacher (that session). */
export async function armAttendanceSummary(db: Db, school: SchoolRef, viewer: Viewer, armId: string, termId?: string) {
  const arm = await findArm(db, school, armId)
  const term = await resolveTerm(db, school, termId)
  if (viewer.role !== 'admin' && viewer.role !== 'principal'
    && (viewer.role !== 'teacher' || !await isClassTeacher(db, school, viewer.id, term.sessionId, arm.id))) {
    throw forbidden()
  }

  const students = await roster(db, school, term.sessionId, arm.id)
  const marks = await termMarks(db, school, term.id, students.map(s => s.id))
  const [{ registers } = { registers: 0 }] = await db.select({ registers: count() }).from(attendanceRegisters)
    .where(whereSchool(attendanceRegisters, school, eq(attendanceRegisters.termId, term.id), eq(attendanceRegisters.classArmId, arm.id)))

  return {
    term,
    arm,
    registers,
    students: students.map(({ photoUrl: _photo, ...s }) => ({ ...s, ...summariseAttendance(marks.filter(m => m.studentId === s.id).map(m => m.status)) })),
  }
}

/** One student's term summary with the dates they were absent or late. No access check: the route does it. */
export async function studentAttendanceSummary(db: Db, school: SchoolRef, studentId: string, termId?: string) {
  const term = await resolveTerm(db, school, termId)
  const marks = await termMarks(db, school, term.id, [studentId])
  return {
    term,
    ...summariseAttendance(marks.map(m => m.status)),
    absentDates: marks.filter(m => m.status === 'absent').map(m => m.date),
    lateDates: marks.filter(m => m.status === 'late').map(m => m.date),
  }
}
