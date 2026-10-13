import { billLines, bills, feeItems, payments, type School } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

type SchoolRef = Pick<School, 'id'>
type Ref = { id: string }

let counter = 0

export async function createFeeItem(db: Db, school: SchoolRef, { term, level, name, amountKobo = 5_000_000, optional = false }: {
  term: Ref
  level: Ref
  name?: string
  amountKobo?: number
  optional?: boolean
}) {
  const [item] = await db.insert(feeItems)
    .values({ schoolId: school.id, termId: term.id, classLevelId: level.id, name: name ?? `Item ${++counter}`, amountKobo, optional }).returning()
  return item!
}

/** A bill with item lines (amounts in kobo) and an optional carry-forward line; no checks. */
export async function createBill(db: Db, school: SchoolRef, { term, student, level, arm, items = [], carryForwardKobo }: {
  term: Ref
  student: Ref
  level: Ref
  arm: Ref
  items?: { name: string, amountKobo: number, feeItem?: Ref }[]
  carryForwardKobo?: number
}) {
  const [bill] = await db.insert(bills)
    .values({ schoolId: school.id, termId: term.id, studentId: student.id, classLevelId: level.id, classArmId: arm.id }).returning()
  const lines = [
    ...items.map(i => ({ schoolId: school.id, billId: bill!.id, feeItemId: i.feeItem?.id ?? null, kind: 'item' as const, description: i.name, amountKobo: i.amountKobo })),
    ...(carryForwardKobo ? [{ schoolId: school.id, billId: bill!.id, feeItemId: null, kind: 'carry_forward' as const, description: 'Arrears brought forward', amountKobo: carryForwardKobo }] : []),
  ]
  if (lines.length) await db.insert(billLines).values(lines)
  return bill!
}

export async function createPayment(db: Db, school: SchoolRef, { bill, student, amountKobo, paidOn = '2026-10-12', reversed = false }: {
  bill: Ref
  student: Ref
  amountKobo: number
  paidOn?: string
  reversed?: boolean
}) {
  const [payment] = await db.insert(payments).values({
    schoolId: school.id, billId: bill.id, studentId: student.id, amountKobo, method: 'cash', paidOn,
    receiptNumber: `TST/${++counter}`,
    ...(reversed ? { reversedAt: new Date(), reversalReason: 'Test reversal' } : {}),
  }).returning()
  return payment!
}
