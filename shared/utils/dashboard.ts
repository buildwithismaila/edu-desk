import type { AttendanceStatus } from '../schemas/attendance'
import { summariseAttendance } from './attendance'

/** `part` of `whole` as a whole percent; null when `whole` is 0 (nothing to measure yet). */
export function percentOf(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : null
}

/**
 * Today's attendance across the school: which arms (those with students) have a register, and the rate over
 * every mark taken today (late counts as present, as in the term summary).
 */
export function todayAttendance<A extends { id: string }>({ arms, registers }: {
  arms: readonly A[]
  registers: readonly { classArmId: string, statuses: readonly AttendanceStatus[] }[]
}) {
  const counted = registers.filter(r => arms.some(a => a.id === r.classArmId))
  const taken = new Set(counted.map(r => r.classArmId))
  const { opened, present, absent, late, rate } = summariseAttendance(counted.flatMap(r => r.statuses))
  return {
    taken: taken.size,
    total: arms.length,
    marked: opened,
    present,
    absent,
    late,
    rate,
    notTaken: arms.filter(a => !taken.has(a.id)),
  }
}
