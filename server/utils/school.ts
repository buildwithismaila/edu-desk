import { defaultAdmissionPrefix } from '../../shared/utils/admission-number'
import type { School } from '../database/schema'

// useStorage is a Nitro auto-import (see tests/helpers/nitro-globals.ts). The `uploads` mount is
// configured in nuxt.config.ts (fs driver under .data/uploads).

/** The uploads storage mount. Keys always start with `schools/<schoolId>/`. */
export function uploadsStorage() {
  return useStorage('uploads')
}

/** Stored file contents as bytes: the disk driver returns a Buffer, Cloudflare's R2 driver an ArrayBuffer. */
export function uploadBytes(data: unknown): Uint8Array | null {
  if (data == null) return null
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new TypeError('Unexpected upload contents')
}

/** An upload's bytes, or null if it isn't there (keys are built from the tenant only, decision 018). */
export async function readUpload(key: string) {
  return uploadBytes(await uploadsStorage().getItemRaw(key))
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
    showFeesOnReportCard: school.showFeesOnReportCard,
    bankAccounts: school.bankAccounts,
    // Until the first admission saves it, the prefix that admission would use
    admissionPrefix: school.admissionPrefix ?? defaultAdmissionPrefix(school.name),
  }
}
