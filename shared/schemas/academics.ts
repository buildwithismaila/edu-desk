import { z } from 'zod'

/** `YYYY/YYYY` with consecutive years, e.g. `2026/2027`. */
export const sessionNameSchema = z.string().trim().refine((name) => {
  const match = /^(\d{4})\/(\d{4})$/.exec(name)
  return !!match && Number(match[2]) === Number(match[1]) + 1
}, 'Use the format 2026/2027 (consecutive years)')

/** `YYYY-MM-DD` that is a real calendar date. */
export const isoDateSchema = z.iso.date('Enter a valid date')

const optionalDate = isoDateSchema.nullable().optional()

export const termDatesSchema = z.object({
  startsOn: optionalDate,
  endsOn: optionalDate,
  nextTermBeginsOn: optionalDate,
})
  // ISO dates compare correctly as strings
  .refine(d => !d.startsOn || !d.endsOn || d.endsOn > d.startsOn, { path: ['endsOn'], message: 'The term must end after it starts' })
  .refine(d => !d.endsOn || !d.nextTermBeginsOn || d.nextTermBeginsOn > d.endsOn, { path: ['nextTermBeginsOn'], message: 'Next term must begin after this term ends' })

export type TermDatesInput = z.input<typeof termDatesSchema>
