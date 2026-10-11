import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { getUserSession, hashPassword, setUserSession, verifyPassword } from '../helpers/nitro-imports'

// Proves the real nuxt-auth-utils runs in the in-process h3 harness (decision 006)
describe('nuxt-auth-utils in the test harness', () => {
  it('hashes and verifies passwords with scrypt', async () => {
    const hash = await hashPassword('password123')

    expect(hash).toMatch(/^\$scrypt\$/)
    expect(await verifyPassword(hash, 'password123')).toBe(true)
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false)
  })

  it('seals a session into a host-only, HttpOnly, SameSite=Lax cookie and reads it back', async () => {
    const app = createApp()
    app.use(createRouter()
      .post('/set', defineEventHandler(async (event) => {
        await setUserSession(event, {
          user: { id: 'u1', name: 'Ada', role: 'admin', mustChangePassword: false },
          secure: { schoolId: 's1' },
        })
        return 'ok'
      }))
      .get('/get', defineEventHandler(event => getUserSession(event))))
    const handler = toWebHandler(app)

    const setRes = await handler(new Request('http://greenfield.lvh.me/set', { method: 'POST' }))
    const setCookie = setRes.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^nuxt-session=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).not.toMatch(/Domain=/i)

    const cookie = setCookie.split(';')[0]!
    const getRes = await handler(new Request('http://greenfield.lvh.me/get', { headers: { cookie } }))
    expect(await getRes.json()).toMatchObject({
      user: { id: 'u1', role: 'admin' },
      secure: { schoolId: 's1' },
    })
  })
})
