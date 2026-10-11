import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, TEMPORARY_PASSWORD_ALPHABET } from '~~/server/utils/password'

describe('generateTemporaryPassword', () => {
  it('is 10 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(10)
      expect([...password].every(c => TEMPORARY_PASSWORD_ALPHABET.includes(c))).toBe(true)
    }
  })

  it('leaves out characters that are easy to confuse when read aloud or copied by hand', () => {
    for (const c of '0O1lI') expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(c)
  })

  it('differs between calls', () => {
    const passwords = new Set(Array.from({ length: 20 }, generateTemporaryPassword))
    expect(passwords.size).toBe(20)
  })
})
