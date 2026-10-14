import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { type Role, STAFF_ROLES } from '../../shared/constants/roles'
import { isAssignableRole, wouldLeaveNoActiveAdmin } from '../../shared/utils/staff'
import { users } from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, isUniqueViolation, notFound } from '../utils/errors'
import { generateTemporaryPassword } from '../utils/password'
import { whereSchool } from '../utils/tenant'
import { deleteUserAssignments, listUserAssignments, resolveSession } from './assignments'

type SchoolRef = { id: string }
type StaffInput = { name: string, email: string, phone: string | null, role: Role }

// hashPassword is a Nitro auto-import (tests/helpers/nitro-globals.ts)

const staffColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: users.role,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
}

/** Staff = non-removed users with a staff role (parents are never staff). */
const isStaff = and(inArray(users.role, STAFF_ROLES), isNull(users.deletedAt))

const emailTaken = () => conflict('This email is already used by another account')

export function listStaff(db: Db, school: SchoolRef, status?: 'active' | 'inactive') {
  const statusFilter = status ? eq(users.isActive, status === 'active') : undefined
  return db.select(staffColumns).from(users).where(whereSchool(users, school, isStaff, statusFilter)).orderBy(asc(users.name))
}

async function findStaff(db: Db, school: SchoolRef, id: string) {
  const [staff] = await db.select(staffColumns).from(users).where(whereSchool(users, school, eq(users.id, id), isStaff))
  if (!staff) throw notFound('Staff member not found')
  return staff
}

/** Emails are unique per school across all accounts, including parents and removed staff. */
async function assertEmailFree(db: Db, school: SchoolRef, email: string, exceptId?: string) {
  const [taken] = await db.select({ id: users.id }).from(users)
    .where(whereSchool(users, school, eq(users.email, email), exceptId ? ne(users.id, exceptId) : undefined))
  if (taken) throw emailTaken()
}

/**
 * 409 if the change would leave the school without an active admin. Locks the school's admin rows,
 * so two admins changing each other at the same time can't both pass the check.
 */
async function assertAdminRemains(db: Db, school: SchoolRef, userId: string, kind: 'deactivate' | 'remove' | 'demote') {
  const admins = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users)
    .where(whereSchool(users, school, eq(users.role, 'admin'), isNull(users.deletedAt)))
    .for('update')
  if (wouldLeaveNoActiveAdmin(admins, { userId, kind })) throw conflict('The school must keep at least one active admin')
}

export async function createStaff(db: Db, school: SchoolRef, input: StaffInput) {
  await assertEmailFree(db, school, input.email)
  const temporaryPassword = generateTemporaryPassword()
  try {
    const [staff] = await db.insert(users)
      .values({ ...input, schoolId: school.id, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, temporaryPasswordAt: new Date() })
      .returning(staffColumns)
    return { staff: staff!, temporaryPassword }
  }
  catch (error) {
    if (isUniqueViolation(error)) throw emailTaken()
    throw error
  }
}

/** A staff member with their assignments for `sessionId` (default: the current session). */
export async function getStaffDetail(db: Db, school: SchoolRef, id: string, sessionId?: string) {
  const staff = await findStaff(db, school, id)
  const session = await resolveSession(db, school, sessionId)
  if (sessionId && !session) throw notFound('Session not found')
  const assignments = session ? await listUserAssignments(db, school, id, session.id) : { classTeacherOf: [], subjects: [] }
  return { ...staff, session, ...assignments }
}

export async function updateStaff(db: Db, school: SchoolRef, actorId: string, id: string, changes: Partial<StaffInput>) {
  return db.transaction(async (tx) => {
    const target = await findStaff(tx, school, id)
    const roleChanges = changes.role !== undefined && changes.role !== target.role
    if (roleChanges) {
      if (id === actorId) throw conflict('You can\'t change your own role')
      if (target.role === 'admin') await assertAdminRemains(tx, school, id, 'demote')
    }
    if (changes.email !== undefined && changes.email !== target.email) await assertEmailFree(tx, school, changes.email, id)

    const [updated] = await tx.update(users).set(changes).where(whereSchool(users, school, eq(users.id, id))).returning(staffColumns)
    if (roleChanges && !isAssignableRole(changes.role!)) await deleteUserAssignments(tx, school, id)
    return updated!
  })
}

/** Can't log in, and an existing session stops at the next request. Assignments are kept. Idempotent. */
export async function deactivateStaff(db: Db, school: SchoolRef, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const target = await findStaff(tx, school, id)
    if (id === actorId) throw conflict('You can\'t deactivate your own account')
    if (target.role === 'admin') await assertAdminRemains(tx, school, id, 'deactivate')
    const [updated] = await tx.update(users).set({ isActive: false }).where(whereSchool(users, school, eq(users.id, id))).returning(staffColumns)
    return updated!
  })
}

export async function reactivateStaff(db: Db, school: SchoolRef, id: string) {
  await findStaff(db, school, id)
  const [updated] = await db.update(users).set({ isActive: true }).where(whereSchool(users, school, eq(users.id, id))).returning(staffColumns)
  return updated!
}

/** Soft delete for staff who left: hidden, can't log in, assignments cleared; the record and email stay. */
export async function removeStaff(db: Db, school: SchoolRef, actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const target = await findStaff(tx, school, id)
    if (id === actorId) throw conflict('You can\'t remove your own account')
    if (target.role === 'admin') await assertAdminRemains(tx, school, id, 'remove')
    await deleteUserAssignments(tx, school, id)
    await tx.update(users).set({ deletedAt: new Date(), isActive: false }).where(whereSchool(users, school, eq(users.id, id)))
  })
}
