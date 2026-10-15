// Stand-in for Nitro's `#imports` in the node test project (aliased in vitest.config.ts).
// Only what server code imports from `#imports` belongs here. nuxt-auth-utils is re-exported
// from its real runtime files (it doesn't export them, hence the paths), so nothing is mocked.

export {
  clearUserSession,
  getUserSession,
  replaceUserSession,
  requireUserSession,
  sessionHooks,
  setUserSession,
} from '../../node_modules/nuxt-auth-utils/dist/runtime/server/utils/session.js'
export { hashPassword, verifyPassword } from '../../node_modules/nuxt-auth-utils/dist/runtime/server/utils/password.js'

/** Fixed test secret; only used to seal cookies inside tests. */
export const TEST_SESSION_PASSWORD = 'test-session-password-at-least-32-chars'

const defaults = { appDomain: 'lvh.me', defaultSchoolSlug: '', trustProxy: false as boolean | 'cloudflare' }

/** Mutable runtime config for tests; call resetTestRuntimeConfig() in afterEach. */
export const testRuntimeConfig = {
  ...defaults,
  // Mirrors nuxt.config.ts + nuxt-auth-utils defaults (production cookie flags)
  session: {
    name: 'nuxt-session',
    password: TEST_SESSION_PASSWORD,
    maxAge: 60 * 60 * 24 * 7,
    cookie: { sameSite: 'lax' as const, secure: true },
  },
  hash: { scrypt: undefined },
}

export function resetTestRuntimeConfig() {
  Object.assign(testRuntimeConfig, defaults)
}

export function useRuntimeConfig() {
  return testRuntimeConfig
}

// In-memory stand-in for Nitro's useStorage(): only the raw-item calls server code uses.
// Keys are normalised like unstorage (`/` → `:`) so tests can assert on them.
const storageItems = new Map<string, unknown>()
const normaliseKey = (key: string) => key.replace(/[/\\]/g, ':')

export function useStorage(base = '') {
  const full = (key: string) => normaliseKey(base ? `${base}:${key}` : key)
  return {
    getItemRaw: async (key: string) => storageItems.get(full(key)) ?? null,
    setItemRaw: async (key: string, value: unknown) => {
      storageItems.set(full(key), value)
    },
    hasItem: async (key: string) => storageItems.has(full(key)),
    removeItem: async (key: string) => {
      storageItems.delete(full(key))
    },
  }
}

/** Keys currently stored (tests only). */
export function testStorageKeys() {
  return [...storageItems.keys()]
}

export function resetTestStorage() {
  storageItems.clear()
}
