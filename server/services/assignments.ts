import { and, asc, eq } from 'drizzle-orm'
import { classArmLabel } from '../../shared/utils/academics'
import { academicSessions, classArms, classLevels, classTeacherAssignments, subjects, subjectTeacherAssignments } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'

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
