/** `DD/MM/YYYY HH:mm` in Lagos time (docs/architecture.md); empty string for no date. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value)).map(p => [p.type, p.value]),
  )
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

/** `YYYY-MM-DD` (a calendar date, no time zone) → `DD/MM/YYYY`; empty string for no date. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}
