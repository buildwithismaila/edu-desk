import type { School } from '../database/schema'

// useStorage is a Nitro auto-import (see tests/helpers/nitro-globals.ts). The `uploads` mount is
// configured in nuxt.config.ts (fs driver under .data/uploads).

/** The uploads storage mount. Keys always start with `schools/<schoolId>/`. */
export function uploadsStorage() {
  return useStorage('uploads')
}

/** Public URL of the school's logo, versioned so a new upload isn't served from cache; null if none. */
export function schoolLogoUrl(school: Pick<School, 'logoKey' | 'logoUpdatedAt'>) {
  if (!school.logoKey) return null
  return `/api/school/logo?v=${school.logoUpdatedAt?.getTime() ?? 0}`
}

/** What GET/PATCH /api/school/profile return. */
export function toSchoolProfile(school: School) {
  return {
    name: school.name,
    address: school.address,
    motto: school.motto,
    phone: school.phone,
    email: school.email,
    logoUrl: schoolLogoUrl(school),
    showPositions: school.showPositions,
  }
}
