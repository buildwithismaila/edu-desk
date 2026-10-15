/**
 * Where uploads (logos, student photos) live, chosen when building: on disk for the Node server (VPS, dev, E2E;
 * decision 018), or in the R2 bucket bound as `UPLOADS` on Cloudflare (wrangler.toml). Keys are the same.
 */
export function uploadsStorageConfig(preset: string | undefined) {
  if (preset?.startsWith('cloudflare')) return { driver: 'cloudflare-r2-binding', binding: 'UPLOADS' } as const
  return { driver: 'fs', base: './.data/uploads' } as const
}
