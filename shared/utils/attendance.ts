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

/**
 * Why a register can't be taken or changed for `date` (ISO dates compare as strings), or null if it can.
 * Class teachers only take today's; admin and principal (`canBackfill`) any day in the term up to today.
 */
export function registerDateError({ date, today, term, canBackfill }: {
  date: string
  today: string
  term: { startsOn: string | null, endsOn: string | null }
  canBackfill: boolean
}): string | null {
  if (date > today) return 'That date is in the future'
  if (!canBackfill && date !== today) return 'You can only take today\'s register'
  if (term.startsOn && date < term.startsOn) return 'That date is before this term started'
  if (term.endsOn && date > term.endsOn) return 'That date is after this term ended'
  return null
}
