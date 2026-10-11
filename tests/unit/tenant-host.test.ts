import { describe, expect, it } from 'vitest'
import { RESERVED_SLUGS, SLUG_PATTERN } from '~~/shared/constants/tenant'
import { resolveTenantSlug } from '~~/server/utils/tenant-host'

const appDomain = 'lvh.me'
const noFallback = { appDomain, defaultSlug: '' }
const withFallback = { appDomain, defaultSlug: 'greenfield' }

describe('resolveTenantSlug', () => {
  it.each([
    ['plain subdomain', 'greenfield.lvh.me'],
    ['with port', 'greenfield.lvh.me:3000'],
    ['uppercase', 'GreenField.LVH.me'],
    ['trailing dot', 'greenfield.lvh.me.'],
    ['trailing dot and port', 'greenfield.lvh.me.:3000'],
  ])('resolves a school from a %s', (_case, host) => {
    expect(resolveTenantSlug(host, noFallback)).toEqual({ kind: 'school', slug: 'greenfield' })
  })

  it('resolves a hyphenated slug', () => {
    expect(resolveTenantSlug('st-marys.lvh.me', noFallback)).toEqual({ kind: 'school', slug: 'st-marys' })
  })

  it.each(RESERVED_SLUGS)('rejects the reserved subdomain %s', (slug) => {
    expect(resolveTenantSlug(`${slug}.lvh.me`, noFallback)).toEqual({ kind: 'none' })
  })

  it.each(RESERVED_SLUGS.filter(s => s !== 'www'))('ignores the fallback for reserved subdomain %s', (slug) => {
    expect(resolveTenantSlug(`${slug}.lvh.me`, withFallback)).toEqual({ kind: 'none' })
  })

  it('uses the fallback school for www', () => {
    expect(resolveTenantSlug('www.lvh.me', withFallback)).toEqual({ kind: 'school', slug: 'greenfield' })
  })

  it.each(['lvh.me', 'lvh.me:3000', 'LVH.ME.'])('uses the fallback school on the bare domain %s', (host) => {
    expect(resolveTenantSlug(host, withFallback)).toEqual({ kind: 'school', slug: 'greenfield' })
  })

  it('resolves nothing on the bare domain without a fallback', () => {
    expect(resolveTenantSlug('lvh.me:3000', noFallback)).toEqual({ kind: 'none' })
  })

  it('prefers the subdomain over the fallback', () => {
    expect(resolveTenantSlug('sunrise.lvh.me', withFallback)).toEqual({ kind: 'school', slug: 'sunrise' })
  })

  it.each([
    ['multi-level subdomain', 'a.b.lvh.me'],
    ['foreign domain', 'greenfield.example.com'],
    ['suffix trick', 'greenfield.evillvh.me'],
    ['domain as a prefix', 'greenfield.lvh.me.evil.com'],
    ['invalid characters', 'gr_een.lvh.me'],
    ['too short', 'ab.lvh.me'],
    ['leading hyphen', '-xyz.lvh.me'],
    ['trailing hyphen', 'xyz-.lvh.me'],
    ['empty label', '.lvh.me'],
    ['IP address', '127.0.0.1:3000'],
    ['empty host', ''],
    ['missing host', undefined],
  ])('resolves nothing for a %s', (_case, host) => {
    expect(resolveTenantSlug(host, withFallback)).toEqual({ kind: 'none' })
  })
})

describe('SLUG_PATTERN', () => {
  it.each(['abc', 'st-marys', 'school2', '123', 'a'.repeat(40)])('accepts %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true)
  })

  it.each(['ab', 'a'.repeat(41), '-abc', 'abc-', 'Abc', 'a_bc', 'a.bc', 'a bc', ''])('rejects %j', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(false)
  })

  it('matches every reserved slug, so reservation is checked separately', () => {
    expect(RESERVED_SLUGS.every(s => SLUG_PATTERN.test(s))).toBe(true)
  })
})
