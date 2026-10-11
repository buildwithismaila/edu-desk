import { randomInt } from 'node:crypto'

/** No 0/O, 1/l/I: temporary passwords are read out or copied by hand. */
export const TEMPORARY_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Random one-time password for an admin reset; the user must change it at next login. */
export function generateTemporaryPassword(length = 10) {
  return Array.from({ length }, () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]).join('')
}
