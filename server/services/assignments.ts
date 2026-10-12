import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { SECTIONS } from '../../shared/constants/academics'
import { classArmLabel } from '../../shared/utils/academics'
import { isAssignableRole } from '../../shared/utils/staff'
import { academicSessions, classArms, classLevels, classTeacherAssignments, subjects, subjectTeacherAssignments, users } from '../database/schema'
import type { Db } from '../utils/db'
import { notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'

type SchoolRef = { id: string }

/** The given session, or the current one; null when there is none (or it isn't the school's). */
export async function resolveSession(db: Db, school: SchoolRef, sessionId?: string) {
  const [session] = await db.select({ id: academicSessions.id, name: academicSessions.name }).from(academicSessions)
    .where(whereSchool(academicSessions, school, sessionId ? eq(academicSessions.id, sessionId) : eq(academicSessions.isCurrent, true)))
  return session ?? null
}

/** What a user is class teacher of and which subjects they teach, in a session. */
export async function listUserAssignments(db: Db, school: SchoolRef, userId: string, sessionId: string) {
  const classTeacherRows = await db
    .select({ classArmId: classArms.id, arm: classArms.name, level: classLevels.name, sortOrder: classLevels.sortOrder })
    .from(classTeacherAssignments)
    .innerJoin(classArms, eq(classTeacherAssignments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classTeacherAssignments, school, and(eq(classTeacherAssignments.sessionId, sessionId), eq(classTeacherAssignments.userId, userId))))
    .orderBy(asc(classLevels.sortOrder), asc(classArms.name))

  const subjectRows = await db
    .select({ subjectId: subjects.id, name: subjects.name, classArmId: classArms.id, arm: classArms.name, level: classLevels.name })
    .from(subjectTeacherAssignments)
    .innerJoin(subjects, eq(subjectTeacherAssignments.subjectId, subjects.id))
    .innerJoin(classArms, eq(subjectTeacherAssignments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(subjectTeacherAssignments, school, and(eq(subjectTeacherAssignments.sessionId, sessionId), eq(subjectTeacherAssignments.userId, userId))))
    .orderBy(asc(classLevels.sortOrder), asc(classArms.name), asc(subjects.name))

  return {
    classTeacherOf: classTeacherRows.map(r => ({ classArmId: r.classArmId, label: classArmLabel(r.level, r.arm) })),
    subjects: subjectRows.map(r => ({ subjectId: r.subjectId, name: r.name, classArmId: r.classArmId, label: classArmLabel(r.level, r.arm) })),
  }
}

/** Removes every assignment of a user (all sessions), e.g. when they become a bursar or are removed. */
export async function deleteUserAssignments(db: Db, school: SchoolRef, userId: string) {
  await db.delete(classTeacherAssignments).where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.userId, userId)))
  await db.delete(subjectTeacherAssignments).where(whereSchool(subjectTeacherAssignments, school, eq(subjectTeacherAssignments.userId, userId)))
}

/** The session to work in: the given one (404 if not the school's) or the current one (400 if none). */
export async function requireSession(db: Db, school: SchoolRef, sessionId?: string) {
  const session = await resolveSession(db, school, sessionId)
  if (session) return session
  if (sessionId) throw notFound('Session not found')
  throw fieldError('sessionId', 'Set a current term first')
}

type Person = { id: string, name: string, isActive: boolean }

async function findArm(db: Db, school: SchoolRef, armId: string) {
  const [arm] = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, eq(classArms.id, armId)))
  if (!arm) throw notFound('Class arm not found')
  return arm
}

/** 400 unless every user is this school's, not removed, active, and a teacher/principal/admin. */
async function assertAssignable(db: Db, school: SchoolRef, userIds: string[], field: string) {
  if (!userIds.length) return
  const people = await db.select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive }).from(users)
    .where(whereSchool(users, school, inArray(users.id, userIds), isNull(users.deletedAt)))
  for (const id of userIds) {
    const person = people.find(p => p.id === id)
    if (!person) throw fieldError(field, 'Choose a member of staff')
    if (!isAssignableRole(person.role)) throw fieldError(field, `${person.name} can't be assigned to teach`)
    if (!person.isActive) throw fieldError(field, `${person.name}'s account is deactivated`)
  }
}

/** Every arm (by section, level order, name) with its class teacher and every subject of its section. */
export async function listAssignments(db: Db, school: SchoolRef, sessionId: string, onlyArmId?: string) {
  const arms = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, onlyArmId ? eq(classArms.id, onlyArmId) : undefined))
    .orderBy(asc(classLevels.sortOrder), asc(classArms.name))
  arms.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section))

  const allSubjects = await db.select({ id: subjects.id, name: subjects.name, section: subjects.section }).from(subjects)
    .where(whereSchool(subjects, school)).orderBy(asc(subjects.name))

  const person = { id: users.id, name: users.name, isActive: users.isActive }
  const classTeachers = await db.select({ classArmId: classTeacherAssignments.classArmId, ...person })
    .from(classTeacherAssignments).innerJoin(users, eq(classTeacherAssignments.userId, users.id))
    .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, sessionId)))
  const subjectTeachers = await db.select({ classArmId: subjectTeacherAssignments.classArmId, subjectId: subjectTeacherAssignments.subjectId, ...person })
    .from(subjectTeacherAssignments).innerJoin(users, eq(subjectTeacherAssignments.userId, users.id))
    .where(whereSchool(subjectTeacherAssignments, school, eq(subjectTeacherAssignments.sessionId, sessionId)))

  const toPerson = (row: Person | undefined) => row ? { id: row.id, name: row.name, isActive: row.isActive } : null
  return arms.map(arm => ({
    classArmId: arm.id,
    label: classArmLabel(arm.level, arm.name),
    section: arm.section,
    classTeacher: toPerson(classTeachers.find(t => t.classArmId === arm.id)),
    subjects: allSubjects.filter(sub => sub.section === arm.section).map(sub => ({
      subjectId: sub.id,
      name: sub.name,
      teacher: toPerson(subjectTeachers.find(t => t.classArmId === arm.id && t.subjectId === sub.id)),
    })),
  }))
}

/** Sets (or with null, clears) the arm's class teacher for the session. One per arm (DB unique). */
export async function setClassTeacher(db: Db, school: SchoolRef, sessionId: string, armId: string, userId: string | null) {
  const arm = await findArm(db, school, armId)
  if (userId) await assertAssignable(db, school, [userId], 'userId')

  const key = and(eq(classTeacherAssignments.sessionId, sessionId), eq(classTeacherAssignments.classArmId, arm.id))
  if (!userId) {
    await db.delete(classTeacherAssignments).where(whereSchool(classTeacherAssignments, school, key))
  }
  else {
    await db.insert(classTeacherAssignments).values({ schoolId: school.id, sessionId, classArmId: arm.id, userId })
      .onConflictDoUpdate({
        target: [classTeacherAssignments.schoolId, classTeacherAssignments.sessionId, classTeacherAssignments.classArmId],
        set: { userId, updatedAt: new Date() },
      })
  }
  return (await listAssignments(db, school, sessionId, arm.id))[0]!
}

/**
 * Sets or clears the teacher of each listed subject in the arm, in one transaction; unlisted subjects
 * are unchanged. Subjects must be this school's and in the arm's section; teachers must be assignable.
 */
export async function setSubjectTeachers(db: Db, school: SchoolRef, sessionId: string, armId: string, assignments: { subjectId: string, userId: string | null }[]) {
  const arm = await findArm(db, school, armId)
  const ids = assignments.map(a => a.subjectId)
  const found = await db.select({ id: subjects.id, name: subjects.name, section: subjects.section }).from(subjects)
    .where(whereSchool(subjects, school, inArray(subjects.id, ids)))
  for (const id of ids) {
    const subject = found.find(sub => sub.id === id)
    if (!subject) throw fieldError('assignments', 'Choose one of your subjects')
    if (subject.section !== arm.section) throw fieldError('assignments', `${subject.name} isn't taught in ${classArmLabel(arm.level, arm.name)}'s section`)
  }
  await assertAssignable(db, school, assignments.flatMap(a => a.userId ? [a.userId] : []), 'assignments')

  await db.transaction(async (tx) => {
    for (const { subjectId, userId } of assignments) {
      const key = and(eq(subjectTeacherAssignments.sessionId, sessionId), eq(subjectTeacherAssignments.classArmId, arm.id), eq(subjectTeacherAssignments.subjectId, subjectId))
      if (!userId) {
        await tx.delete(subjectTeacherAssignments).where(whereSchool(subjectTeacherAssignments, school, key))
        continue
      }
      await tx.insert(subjectTeacherAssignments).values({ schoolId: school.id, sessionId, classArmId: arm.id, subjectId, userId })
        .onConflictDoUpdate({
          target: [subjectTeacherAssignments.schoolId, subjectTeacherAssignments.sessionId, subjectTeacherAssignments.classArmId, subjectTeacherAssignments.subjectId],
          set: { userId, updatedAt: new Date() },
        })
    }
  })
  return (await listAssignments(db, school, sessionId, arm.id))[0]!
}
