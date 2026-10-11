// Stand-in for Nitro's `#imports` in the node test project (aliased in vitest.config.ts).
// Only what server code imports from `#imports` belongs here.

const defaults = { appDomain: 'lvh.me', defaultSchoolSlug: '' }

/** Mutable runtime config for tests; call resetTestRuntimeConfig() in afterEach. */
export const testRuntimeConfig = { ...defaults }

export function resetTestRuntimeConfig() {
  Object.assign(testRuntimeConfig, defaults)
}

export function useRuntimeConfig() {
  return testRuntimeConfig
}
