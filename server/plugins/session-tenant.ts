import { defineNitroPlugin, sessionHooks } from '#imports'
import { rejectForeignSession } from '../utils/auth'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', rejectForeignSession)
})
