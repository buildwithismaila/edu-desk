import { describe, expect, it, vi } from 'vitest'
import { requestScopedDb } from '~~/server/utils/request-db'
import { uploadsStorageConfig } from '~~/server/utils/storage-config'

const fakeDb = (url: string) => ({ url }) as never

describe('requestScopedDb (Cloudflare: one database client per request, through Hyperdrive)', () => {
  it('creates a client from the Hyperdrive binding once per request and reuses it within the request', () => {
    const create = vi.fn(fakeDb)
    const request = { cloudflare: { env: { DB: { connectionString: 'postgres://hyperdrive/a' } } } }
    const first = requestScopedDb(request, create)
    expect(first).toEqual({ url: 'postgres://hyperdrive/a' })
    expect(requestScopedDb(request, create)).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('gives two requests separate clients (Workers can\'t share a connection across requests)', () => {
    const create = vi.fn(fakeDb)
    const env = { DB: { connectionString: 'postgres://hyperdrive/a' } }
    const a = requestScopedDb({ cloudflare: { env } }, create)
    const b = requestScopedDb({ cloudflare: { env } }, create)
    expect(a).not.toBe(b)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does nothing outside Cloudflare, so Node keeps its shared pool', () => {
    const create = vi.fn(fakeDb)
    expect(requestScopedDb({}, create)).toBeUndefined()
    expect(requestScopedDb({ cloudflare: { env: {} } }, create)).toBeUndefined()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('uploadsStorageConfig', () => {
  it('keeps uploads on disk for the Node server (VPS, dev, E2E)', () => {
    for (const preset of [undefined, '', 'node-server']) {
      expect(uploadsStorageConfig(preset)).toEqual({ driver: 'fs', base: './.data/uploads' })
    }
  })

  it('uses the R2 bucket bound as UPLOADS on Cloudflare', () => {
    for (const preset of ['cloudflare_module', 'cloudflare-module', 'cloudflare_pages']) {
      expect(uploadsStorageConfig(preset)).toEqual({ driver: 'cloudflare-r2-binding', binding: 'UPLOADS' })
    }
  })
})

describe('uploadBytes (the same bytes from disk or R2)', () => {
  it('passes bytes through, wraps an ArrayBuffer, and keeps "missing" as null', async () => {
    const { uploadBytes } = await import('~~/server/utils/school')
    const bytes = new Uint8Array([137, 80, 78, 71])
    expect(uploadBytes(bytes)).toBe(bytes)
    expect(uploadBytes(Buffer.from(bytes))).toEqual(Buffer.from(bytes))
    expect(Array.from(uploadBytes(bytes.buffer)!)).toEqual([137, 80, 78, 71])
    expect(uploadBytes(null)).toBeNull()
    expect(uploadBytes(undefined)).toBeNull()
    expect(() => uploadBytes('text')).toThrow('Unexpected upload contents')
  })
})
