import type { AttendanceStatus } from '../schemas/attendance'

/**
 * A student's attendance from their own marks (docs/domain.md): `opened` = registers that include
 * them, late counts as present (and is also shown on its own), rate = present / opened as a whole percent.
 */
export function summariseAttendance(statuses: readonly AttendanceStatus[]) {
  const absent = statuses.filter(s => s === 'absent').length
  const late = statuses.filter(s => s === 'late').length
  const opened = statuses.length
  const present = opened - absent
  return { opened, present, absent, late, rate: opened ? Math.round((present / opened) * 100) : null }
}

/** A register taken offline may arrive this many days after its date (Phase 10c). */
export const OFFLINE_LATE_DAYS = 3

/** Whole days from `earlier` to `later` (ISO dates). */
function daysBetween(earlier: string, later: string) {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000)
}

/**
 * Why a register can't be taken or changed for `date` (ISO dates compare as strings), or null if it can.
 * Class teachers only take today's; admin and principal (`canBackfill`) any day in the term up to today.
 * A register taken `offline` on a teacher's phone may arrive up to OFFLINE_LATE_DAYS after its date.
 */
export function registerDateError({ date, today, term, canBackfill, offline = false }: {
  date: string
  today: string
  term: { startsOn: string | null, endsOn: string | null }
  canBackfill: boolean
  offline?: boolean
}): string | null {
  if (date > today) return 'That date is in the future'
  if (!canBackfill && date !== today) {
    if (!offline) return 'You can only take today\'s register'
    if (daysBetween(date, today) > OFFLINE_LATE_DAYS) return `This register is more than ${OFFLINE_LATE_DAYS} days old. Ask an admin to enter it.`
  }
  if (term.startsOn && date < term.startsOn) return 'That date is before this term started'
  if (term.endsOn && date > term.endsOn) return 'That date is after this term ended'
  return null
}
