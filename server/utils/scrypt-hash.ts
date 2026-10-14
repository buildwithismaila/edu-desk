import { randomBytes, scrypt } from 'node:crypto'

// Same format and settings as nuxt-auth-utils' hashPassword (@adonisjs/hash scrypt defaults), for code that
// runs outside Nitro, where that helper isn't available (scripts/create-school.ts). The app's login verifies
// these hashes; tests/integration/school-onboarding.test.ts checks that.
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 33_554_432 }
const KEY_LENGTH = 64
const SALT_BYTES = 16

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '')

export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, PARAMS, (error, derived) => (error ? reject(error) : resolve(derived))))
  return `$scrypt$n=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}$${b64(salt)}$${b64(key)}`
}
