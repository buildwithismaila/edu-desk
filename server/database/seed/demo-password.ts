// Dev/E2E demo credentials only — the seed refuses to run in production.
// The seed runs outside Nitro (tsx), where nuxt-auth-utils' hashPassword() isn't available, so the
// hash is precomputed with the same scrypt settings. tests/integration/db.test.ts verifies it.

export const DEMO_PASSWORD = 'password123'

export const DEMO_PASSWORD_HASH = '$scrypt$n=16384,r=8,p=1$cHTW4JvBd8+K/7eIbxkNhw$z5uVk7ObLsO4102CBz/7vCcX7vkS7N/Lf5z4tfVLNEG/3v1c0avu3jv5ejDYFgH5pTyRsQXasuvpRVuQdg9qjA'
