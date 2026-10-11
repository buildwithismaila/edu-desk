// Server code uses nuxt-auth-utils' utils as Nitro auto-imports (globals), not `#imports`:
// Nuxt type-checks API handlers in the app context too (typed $fetch), where `#imports` is the
// app's and lacks them, while auto-import globals are declared in both. Register the real ones here.
import { clearUserSession, getUserSession, hashPassword, replaceUserSession, setUserSession, useStorage, verifyPassword } from './nitro-imports'

// Nitro's useStorage is a stand-in (in-memory) — see nitro-imports.ts
Object.assign(globalThis, { clearUserSession, getUserSession, hashPassword, replaceUserSession, setUserSession, useStorage, verifyPassword })
