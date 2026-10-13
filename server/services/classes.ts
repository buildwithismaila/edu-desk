import { and, asc, eq, max, ne, sql } from 'drizzle-orm'
import { SECTIONS, type Section } from '../../shared/constants/academics'
import { classArmLabel } from '../../shared/utils/academics'
import { attendanceRegisters, type ClassArm, classArms, type ClassLevel, classLevels, studentEnrolments } from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { armHasResults } from './scores'

type SchoolRef = { id: string }

const toArmDto = (level: Pick<ClassLevel, 'name'>, arm: ClassArm) =>
  ({ id: arm.id, classLevelId: arm.classLevelId, name: arm.name, label: classArmLabel(level.name, arm.name) })

const toLevelDto = (level: ClassLevel, arms: ClassArm[]) => ({
  id: level.id,
  section: level.section,
  name: level.name,
  sortOrder: level.sortOrder,
  arms: arms.filter(a => a.classLevelId === level.id).map(a => toArmDto(level, a)),
})

/** Case-insensitive name match (the DB unique constraints are case-sensitive). */
const sameName = (column: typeof classLevels.name | typeof classArms.name, name: string) =>
  sql`lower(${column}) = lower(${name})`

/** Levels by section (Nursery → SSS), then the school's order; arms by name. */
export async function listClassLevels(db: Db, school: SchoolRef) {
  const levels = await db.select().from(classLevels).where(whereSchool(classLevels, school)).orderBy(asc(classLevels.sortOrder))
  const arms = await db.select().from(classArms).where(whereSchool(classArms, school)).orderBy(asc(classArms.name))
  const sectionIndex = (s: Section) => SECTIONS.indexOf(s)
  return [...levels]
    .sort((a, b) => sectionIndex(a.section) - sectionIndex(b.section) || a.sortOrder - b.sortOrder)
    .map(level => toLevelDto(level, arms))
}

async function findLevel(db: Db, school: SchoolRef, id: string) {
  const [level] = await db.select().from(classLevels).where(whereSchool(classLevels, school, eq(classLevels.id, id)))
  if (!level) throw notFound('Class level not found')
  return level
}

async function assertLevelNameFree(db: Db, school: SchoolRef, name: string, exceptId?: string) {
  const [clash] = await db.select({ id: classLevels.id }).from(classLevels)
    .where(whereSchool(classLevels, school, sameName(classLevels.name, name), exceptId ? ne(classLevels.id, exceptId) : undefined))
  if (clash) throw conflict(`There is already a class level called ${name}`)
}

export async function createClassLevel(db: Db, school: SchoolRef, input: { section: Section, name: string }) {
  await assertLevelNameFree(db, school, input.name)
  const [{ last } = { last: null }] = await db.select({ last: max(classLevels.sortOrder) }).from(classLevels).where(whereSchool(classLevels, school))
  const [level] = await db.insert(classLevels).values({ ...input, schoolId: school.id, sortOrder: (last ?? -1) + 1 }).returning()
  return toLevelDto(level!, [])
}

export async function renameClassLevel(db: Db, school: SchoolRef, id: string, name: string) {
  await findLevel(db, school, id)
  await assertLevelNameFree(db, school, name, id)
  const [level] = await db.update(classLevels).set({ name }).where(whereSchool(classLevels, school, eq(classLevels.id, id))).returning()
  const arms = await db.select().from(classArms).where(whereSchool(classArms, school, eq(classArms.classLevelId, id)))
  return toLevelDto(level!, arms)
}

/** `ids` must be exactly the school's level ids (each once); 400 otherwise, and nothing changes. */
export async function reorderClassLevels(db: Db, school: SchoolRef, ids: string[]) {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: classLevels.id }).from(classLevels).where(whereSchool(classLevels, school))
    const known = new Set(existing.map(l => l.id))
    if (new Set(ids).size !== ids.length || ids.length !== known.size || !ids.every(id => known.has(id))) {
      throw fieldError('ids', 'Send every class level exactly once')
    }
    for (const [i, id] of ids.entries()) {
      await tx.update(classLevels).set({ sortOrder: i }).where(whereSchool(classLevels, school, eq(classLevels.id, id)))
    }
  })
  return listClassLevels(db, school)
}

export async function deleteClassLevel(db: Db, school: SchoolRef, id: string) {
  await findLevel(db, school, id)
  const [arm] = await db.select({ id: classArms.id }).from(classArms).where(whereSchool(classArms, school, eq(classArms.classLevelId, id))).limit(1)
  if (arm) throw conflict('This class level has arms. Delete its arms first.')
  await db.delete(classLevels).where(whereSchool(classLevels, school, eq(classLevels.id, id)))
}

async function assertArmNameFree(db: Db, school: SchoolRef, classLevelId: string, name: string, exceptId?: string) {
  const [clash] = await db.select({ id: classArms.id }).from(classArms)
    .where(whereSchool(classArms, school, and(eq(classArms.classLevelId, classLevelId), sameName(classArms.name, name)), exceptId ? ne(classArms.id, exceptId) : undefined))
  if (clash) throw conflict(`This class level already has an arm called ${name}`)
}

export async function createClassArm(db: Db, school: SchoolRef, classLevelId: string, name: string) {
  const level = await findLevel(db, school, classLevelId)
  await assertArmNameFree(db, school, level.id, name)
  const [arm] = await db.insert(classArms).values({ schoolId: school.id, classLevelId: level.id, name }).returning()
  return toArmDto(level, arm!)
}

async function findArm(db: Db, school: SchoolRef, id: string) {
  const [row] = await db.select({ arm: classArms, level: classLevels }).from(classArms)
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, eq(classArms.id, id)))
  if (!row) throw notFound('Class arm not found')
  return row
}

export async function renameClassArm(db: Db, school: SchoolRef, id: string, name: string) {
  const { arm, level } = await findArm(db, school, id)
  await assertArmNameFree(db, school, arm.classLevelId, name, arm.id)
  const [updated] = await db.update(classArms).set({ name }).where(whereSchool(classArms, school, eq(classArms.id, id))).returning()
  return toArmDto(level, updated!)
}

/** 409 while any student is enrolled in the arm or it has attendance (any session), so history isn't lost. */
export async function deleteClassArm(db: Db, school: SchoolRef, id: string) {
  await findArm(db, school, id)
  const [enrolled] = await db.select({ id: studentEnrolments.id }).from(studentEnrolments)
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.classArmId, id))).limit(1)
  if (enrolled) throw conflict('This class arm has students. Move them to another arm first.')
  const [register] = await db.select({ id: attendanceRegisters.id }).from(attendanceRegisters)
    .where(whereSchool(attendanceRegisters, school, eq(attendanceRegisters.classArmId, id))).limit(1)
  if (register) throw conflict('This class arm has attendance records, so it can\'t be deleted.')
  if (await armHasResults(db, school, id)) throw conflict('This class arm has results or locked scores, so it can\'t be deleted.')
  await db.delete(classArms).where(whereSchool(classArms, school, eq(classArms.id, id)))
}
