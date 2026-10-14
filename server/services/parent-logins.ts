import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'
import { classArmLabel } from '../../shared/utils/academics'
import { type ParentLoginStatus, parentLoginStatus } from '../../shared/utils/parent-logins'
import { normalisePhone } from '../../shared/utils/phone'
import { academicSessions, classArms, classLevels, studentEnrolments, studentGuardians, students, users } from '../database/schema'
import type { Db } from '../utils/db'
import { generateTemporaryPassword } from '../utils/password'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { findArm } from './scores'

// Parent logins in bulk (docs/features/10a-pilot-readiness.md): the admin gives parents one-time passwords,
// printed on login slips. hashPassword is a Nitro auto-import (tests/helpers/nitro-globals.ts).

type SchoolRef = { id: string }
export const PARENT_LOGINS_PAGE_SIZE = 50

const STATUS_CONDITION: Record<ParentLoginStatus, SQL> = {
  none: and(eq(users.mustChangePassword, true), isNull(users.temporaryPasswordAt))!,
  issued: and(eq(users.mustChangePassword, true), isNotNull(users.temporaryPasswordAt))!,
  active: eq(users.mustChangePassword, false),
}

/** Parents (active accounts) who have a non-removed child in the arm this session. */
async function parentIdsInArm(db: Db, school: SchoolRef, armId: string) {
  const rows = await db.selectDistinct({ id: studentGuardians.guardianId })
    .from(studentGuardians)
    .innerJoin(students, eq(studentGuardians.studentId, students.id))
    .innerJoin(studentEnrolments, eq(studentEnrolments.studentId, students.id))
    .innerJoin(academicSessions, and(eq(studentEnrolments.sessionId, academicSessions.id), eq(academicSessions.isCurrent, true)))
    .where(whereSchool(studentGuardians, school, eq(studentEnrolments.classArmId, armId), isNull(students.deletedAt)))
  return rows.map(r => r.id)
}

/** Each parent's non-removed children with their class this session. */
async function childrenOf(db: Db, school: SchoolRef, parentIds: string[]) {
  if (!parentIds.length) return new Map<string, { name: string, classLabel: string | null }[]>()
  const rows = await db.select({
    parentId: studentGuardians.guardianId,
    firstName: students.firstName,
    lastName: students.lastName,
    arm: classArms.name,
    level: classLevels.name,
  })
    .from(studentGuardians)
    .innerJoin(students, eq(studentGuardians.studentId, students.id))
    .leftJoin(academicSessions, and(eq(academicSessions.schoolId, students.schoolId), eq(academicSessions.isCurrent, true)))
    .leftJoin(studentEnrolments, and(eq(studentEnrolments.studentId, students.id), eq(studentEnrolments.sessionId, academicSessions.id)))
    .leftJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .leftJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(studentGuardians, school, inArray(studentGuardians.guardianId, parentIds), isNull(students.deletedAt)))
    .orderBy(asc(students.firstName), asc(students.lastName))
  const byParent = new Map<string, { name: string, classLabel: string | null }[]>()
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? []
    list.push({ name: `${r.firstName} ${r.lastName}`, classLabel: r.level && r.arm ? classArmLabel(r.level, r.arm) : null })
    byParent.set(r.parentId, list)
  }
  return byParent
}

const isParent = and(eq(users.role, 'parent'), isNull(users.deletedAt))!

/** Parents with children and login status; filter by class (this session), status, or name / phone / email. */
export async function listParentLogins(db: Db, school: SchoolRef, query: { classArmId?: string, status?: ParentLoginStatus, search?: string, page: number }) {
  const inArm = query.classArmId ? await parentIdsInArm(db, school, (await findArm(db, school, query.classArmId)).id) : null
  if (inArm && !inArm.length) return { items: [], total: 0, page: query.page, pageSize: PARENT_LOGINS_PAGE_SIZE }
  const phone = query.search ? normalisePhone(query.search) : null
  const term = query.search ? `%${query.search}%` : null
  const where = whereSchool(users, school,
    isParent,
    inArm ? inArray(users.id, inArm) : undefined,
    query.status ? STATUS_CONDITION[query.status] : undefined,
    term ? or(ilike(users.name, term), ilike(users.email, term), phone ? eq(users.phone, phone) : sql`false`) : undefined,
  )
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(users).where(where)
  const rows = await db.select({
    id: users.id,
    name: users.name,
    phone: users.phone,
    email: users.email,
    mustChangePassword: users.mustChangePassword,
    temporaryPasswordAt: users.temporaryPasswordAt,
    lastLoginAt: users.lastLoginAt,
  }).from(users).where(where).orderBy(asc(users.name)).limit(PARENT_LOGINS_PAGE_SIZE).offset((query.page - 1) * PARENT_LOGINS_PAGE_SIZE)
  const children = await childrenOf(db, school, rows.map(r => r.id))
  return {
    items: rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      status: parentLoginStatus(r),
      lastLoginAt: r.lastLoginAt,
      children: children.get(r.id) ?? [],
    })),
    total,
    page: query.page,
    pageSize: PARENT_LOGINS_PAGE_SIZE,
  }
}

/**
 * One-time passwords for parents, returned once for printing on login slips (they must change them at first
 * login). `all` and `classArmId` only cover parents with no login yet, so slips already sent home stay valid;
 * listed parents are regenerated (their old slip stops working), active ones only with `includeActive`.
 */
export async function generateParentLogins(db: Db, school: SchoolRef, input: { all?: true, classArmId?: string, guardianIds?: string[], includeActive?: boolean }) {
  let targets: { id: string, status: ParentLoginStatus }[]
  if (input.guardianIds) {
    const ids = [...new Set(input.guardianIds)]
    const rows = await db.select({ id: users.id, mustChangePassword: users.mustChangePassword, temporaryPasswordAt: users.temporaryPasswordAt })
      .from(users).where(whereSchool(users, school, isParent, inArray(users.id, ids)))
    if (rows.length !== ids.length) throw fieldError('guardianIds', 'Some of these are not parents at this school')
    targets = rows.map(r => ({ id: r.id, status: parentLoginStatus(r) }))
  }
  else {
    const inArm = input.classArmId ? await parentIdsInArm(db, school, (await findArm(db, school, input.classArmId)).id) : null
    const rows = inArm && !inArm.length
      ? []
      : await db.select({ id: users.id }).from(users).where(whereSchool(users, school, isParent, STATUS_CONDITION.none, inArm ? inArray(users.id, inArm) : undefined))
    targets = rows.map(r => ({ id: r.id, status: 'none' as const }))
  }
  const chosen = targets.filter(t => t.status !== 'active' || input.includeActive)

  // scrypt is slow on purpose: hash a few at a time
  const passwords = new Map<string, string>()
  const hashes = new Map<string, string>()
  for (let i = 0; i < chosen.length; i += 8) {
    await Promise.all(chosen.slice(i, i + 8).map(async ({ id }) => {
      const password = generateTemporaryPassword()
      passwords.set(id, password)
      hashes.set(id, await hashPassword(password))
    }))
  }
  const now = new Date()
  await db.transaction(async (tx) => {
    for (const { id } of chosen) {
      await tx.update(users).set({ passwordHash: hashes.get(id)!, mustChangePassword: true, temporaryPasswordAt: now })
        .where(whereSchool(users, school, eq(users.id, id)))
    }
  })

  const people = chosen.length
    ? await db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email }).from(users)
        .where(whereSchool(users, school, inArray(users.id, chosen.map(c => c.id)))).orderBy(asc(users.name))
    : []
  const children = await childrenOf(db, school, people.map(p => p.id))
  return {
    slips: people.map(p => ({ guardianId: p.id, name: p.name, phone: p.phone, email: p.email, children: children.get(p.id) ?? [], temporaryPassword: passwords.get(p.id)! })),
    skipped: targets.length - chosen.length,
  }
}
