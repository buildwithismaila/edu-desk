import { eq, inArray } from 'drizzle-orm'
import { bills, feeItems, terms } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'

type SchoolRef = { id: string }

/** Whether the class level has fee items or bills (any term): deleting it would lose them. */
export async function levelHasFees(db: Db, school: SchoolRef, levelId: string) {
  const [item] = await db.select({ id: feeItems.id }).from(feeItems).where(whereSchool(feeItems, school, eq(feeItems.classLevelId, levelId))).limit(1)
  if (item) return true
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, eq(bills.classLevelId, levelId))).limit(1)
  return !!bill
}

/** Whether any bill was raised for the arm (any term). */
export async function armHasBills(db: Db, school: SchoolRef, armId: string) {
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, eq(bills.classArmId, armId))).limit(1)
  return !!bill
}

/** Whether any term of the session has fee items or bills (payments always belong to a bill). */
export async function sessionHasFees(db: Db, school: SchoolRef, sessionId: string) {
  const termIds = (await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, sessionId)))).map(t => t.id)
  if (!termIds.length) return false
  const [item] = await db.select({ id: feeItems.id }).from(feeItems).where(whereSchool(feeItems, school, inArray(feeItems.termId, termIds))).limit(1)
  if (item) return true
  const [bill] = await db.select({ id: bills.id }).from(bills).where(whereSchool(bills, school, inArray(bills.termId, termIds))).limit(1)
  return !!bill
}
