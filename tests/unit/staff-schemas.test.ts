import { describe, expect, it } from 'vitest'
import { createStaffSchema, updateStaffSchema } from '~~/shared/schemas/staff'

const valid = { name: 'Chioma Obi', email: 'Chioma@School.TEST ', phone: '0802 111 2233', role: 'teacher' }

describe('createStaffSchema', () => {
  it('normalises email and phone', () => {
    expect(createStaffSchema.parse(valid)).toEqual({ name: 'Chioma Obi', email: 'chioma@school.test', phone: '+2348021112233', role: 'teacher' })
  })

  it('allows no phone', () => {
    expect(createStaffSchema.parse({ ...valid, phone: '' }).phone).toBeNull()
    expect(createStaffSchema.parse({ name: valid.name, email: valid.email, role: 'bursar' }).phone).toBeNull()
  })

  it.each([
    ['a parent role', { role: 'parent' }, 'role'],
    ['an unknown role', { role: 'owner' }, 'role'],
    ['a one-letter name', { name: 'A' }, 'name'],
    ['an invalid email', { email: 'nope' }, 'email'],
    ['an invalid phone', { phone: '12345' }, 'phone'],
  ])('rejects %s', (_case, override, field) => {
    const result = createStaffSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.path[0])).toContain(field)
  })
})

describe('updateStaffSchema', () => {
  it('accepts a partial update', () => {
    expect(updateStaffSchema.parse({ role: 'principal' })).toEqual({ role: 'principal' })
  })

  it('still rejects a parent role', () => {
    expect(updateStaffSchema.safeParse({ role: 'parent' }).success).toBe(false)
  })
})
