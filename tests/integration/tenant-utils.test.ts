import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { requireTenant, type TenantSchool } from '~~/server/utils/tenant'

const school: TenantSchool = { id: '00000000-0000-4000-8000-000000000001', slug: 'greenfield', name: 'Greenfield Academy', status: 'active' }

const eventWith = (context: H3Event['context']) => ({ context }) as H3Event

describe('requireTenant', () => {
  it('returns the school set by the tenant middleware', () => {
    expect(requireTenant(eventWith({ school }))).toBe(school)
  })

  it('throws 404 when no school was resolved', () => {
    expect(() => requireTenant(eventWith({}))).toThrow(expect.objectContaining({ statusCode: 404, statusMessage: 'School not found' }))
  })
})
