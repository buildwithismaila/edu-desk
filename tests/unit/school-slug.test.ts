import { describe, expect, it } from 'vitest'
import { schoolSlugError } from '~~/shared/utils/school-slug'

describe('schoolSlugError', () => {
  it('accepts lowercase letters, digits and inner hyphens, 3–40 characters', () => {
    for (const slug of ['greenfield', 'st-marys', 'abc', 'school2', 'a'.repeat(40)]) expect([slug, schoolSlugError(slug)]).toEqual([slug, null])
  })

  it('refuses reserved names', () => {
    for (const slug of ['www', 'admin', 'api', 'app', 'mail', 'support', 'platform']) {
      expect(schoolSlugError(slug)).toBe(`"${slug}" is reserved. Choose another name.`)
    }
  })

  it('explains the format otherwise', () => {
    for (const slug of ['ab', 'a'.repeat(41), 'Greenfield', 'green field', '-green', 'green-', 'green_field', 'green.field', '']) {
      expect([slug, schoolSlugError(slug)]).toEqual([slug, 'Use 3–40 lowercase letters, digits or hyphens (not at the start or end), e.g. greenfield'])
    }
  })
})
