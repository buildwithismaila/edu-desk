import { describe, expect, it } from 'vitest'
import { errorLogLine } from '~~/server/utils/error-log'

const now = new Date('2026-10-14T09:30:00.000Z')

describe('errorLogLine', () => {
  it('logs server errors as one JSON line with the route and school, never the query string', () => {
    const error = Object.assign(new Error('relation "x" does not exist'), { statusCode: 500 })
    const line = errorLogLine(error, { method: 'GET', path: '/api/students?search=Ada%20Obi', school: 'greenfield' }, now)

    expect(JSON.parse(line!)).toEqual({
      level: 'error',
      time: '2026-10-14T09:30:00.000Z',
      method: 'GET',
      path: '/api/students',
      school: 'greenfield',
      status: 500,
      message: 'relation "x" does not exist',
      stack: expect.stringContaining('Error: relation'),
    })
  })

  it('treats an error without a status as a 500, and works without a request', () => {
    expect(JSON.parse(errorLogLine(new Error('boom'), undefined, now)!)).toMatchObject({ status: 500, method: null, path: null, school: null })
  })

  it('skips client errors (4xx): they are expected, not faults', () => {
    for (const statusCode of [400, 401, 403, 404, 409, 429]) {
      expect(errorLogLine(Object.assign(new Error('nope'), { statusCode }), { method: 'POST', path: '/api/x', school: null }, now)).toBeNull()
    }
  })
})
