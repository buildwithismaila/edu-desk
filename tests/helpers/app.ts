import { createApp, createRouter, defineEventHandler, send, setResponseStatus, toWebHandler } from 'h3'
import currentTermHandler from '~~/server/api/academic/current.get'
import loginHandler from '~~/server/api/auth/login.post'
import logoutHandler from '~~/server/api/auth/logout.post'
import passwordHandler from '~~/server/api/auth/password.post'
import schoolHandler from '~~/server/api/school.get'
import logoDeleteHandler from '~~/server/api/school/logo.delete'
import logoGetHandler from '~~/server/api/school/logo.get'
import logoPutHandler from '~~/server/api/school/logo.put'
import profileGetHandler from '~~/server/api/school/profile.get'
import profilePatchHandler from '~~/server/api/school/profile.patch'
import sessionDeleteHandler from '~~/server/api/sessions/[id].delete'
import sessionPatchHandler from '~~/server/api/sessions/[id].patch'
import sessionsGetHandler from '~~/server/api/sessions/index.get'
import sessionsPostHandler from '~~/server/api/sessions/index.post'
import termPatchHandler from '~~/server/api/terms/[id].patch'
import termSetCurrentHandler from '~~/server/api/terms/[id]/set-current.post'
import resetPasswordHandler from '~~/server/api/users/[id]/reset-password.post'
import usersHandler from '~~/server/api/users/index.get'
import tenantMiddleware from '~~/server/middleware/00.tenant'
import { rejectForeignSession, requireRole, requireUser } from '~~/server/utils/auth'
import { resetLoginThrottle } from '~~/server/utils/login-throttle'
import { clearTenantCache } from '~~/server/utils/tenant'
import { setDb, type Db } from '~~/server/utils/db'
// nuxt-auth-utils' built-in endpoint used by useUserSession() on the client
import builtinSessionHandler from '../../node_modules/nuxt-auth-utils/dist/runtime/server/api/session.get.js'
import { sessionHooks } from './nitro-imports'

// What server/plugins/session-tenant.ts does at Nitro startup (once: the hooks are module-level)
sessionHooks.hook('fetch', rejectForeignSession)

interface RequestOptions extends RequestInit {
  /** Host header, e.g. `greenfield.lvh.me:3000` — this is how tests pick the tenant. */
  host: string
  /** Cookie header, e.g. from login(). */
  cookie?: string
}

/**
 * The real middleware and route handlers mounted in a plain h3 app, backed by `db`.
 * Mirrors Nitro's order: middleware first, then the router, and Nitro's JSON error body.
 */
export function createTestApp(db: Db) {
  setDb(db)
  clearTenantCache()
  resetLoginThrottle()

  const app = createApp({
    // Nitro's JSON error body includes `message` for handled errors; plain h3 leaves it out
    onError: (error, event) => {
      setResponseStatus(event, error.statusCode, error.statusMessage)
      return send(event, JSON.stringify({
        error: true,
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        message: error.unhandled ? 'Server Error' : error.message,
        data: error.data,
      }), 'application/json')
    },
  })
  app.use(tenantMiddleware)
  app.use(createRouter()
    .get('/api/school', schoolHandler)
    .get('/api/school/logo', logoGetHandler)
    .put('/api/school/logo', logoPutHandler)
    .delete('/api/school/logo', logoDeleteHandler)
    .get('/api/school/profile', profileGetHandler)
    .patch('/api/school/profile', profilePatchHandler)
    .get('/api/academic/current', currentTermHandler)
    .get('/api/sessions', sessionsGetHandler)
    .post('/api/sessions', sessionsPostHandler)
    .patch('/api/sessions/:id', sessionPatchHandler)
    .delete('/api/sessions/:id', sessionDeleteHandler)
    .patch('/api/terms/:id', termPatchHandler)
    .post('/api/terms/:id/set-current', termSetCurrentHandler)
    .post('/api/auth/login', loginHandler)
    .post('/api/auth/logout', logoutHandler)
    .post('/api/auth/password', passwordHandler)
    .get('/api/users', usersHandler)
    .post('/api/users/:id/reset-password', resetPasswordHandler)
    .get('/api/_auth/session', builtinSessionHandler)
    // Test-only probes for the auth utils; real routes are tested in their own files
    .get('/__test/require-user', defineEventHandler(async event => ({ id: (await requireUser(event)).id })))
    .get('/__test/require-admin', defineEventHandler(async event => ({ id: (await requireRole(event, ['admin'])).id }))))
  // Stand-in for Nuxt's asset/renderer handlers, to check which paths the middleware lets through
  app.use(defineEventHandler(() => 'passed through'))

  const handler = toWebHandler(app)

  function request(path: string, { host, cookie, headers, ...init }: RequestOptions) {
    return handler(new Request(`http://${host}${path}`, {
      ...init,
      headers: { ...headers, host, ...(cookie ? { cookie } : {}) },
    }))
  }

  function postJson(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'>) {
    return request(path, {
      ...options,
      method: 'POST',
      headers: { ...options.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /** Logs in and returns the session cookie (`name=value`) to send on later requests. */
  async function login(host: string, email: string, password: string) {
    const res = await postJson('/api/auth/login', { email, password }, { host })
    if (res.status !== 200) throw new Error(`login failed with ${res.status}: ${await res.text()}`)
    return sessionCookie(res)!
  }

  return { request, postJson, login }
}

/** The `name=value` part of the session Set-Cookie header, if any. */
export function sessionCookie(res: Response) {
  const header = res.headers.getSetCookie().find(c => c.startsWith('nuxt-session='))
  return header?.split(';')[0]
}
