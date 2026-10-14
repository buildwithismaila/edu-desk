// defineNitroPlugin is a Nitro auto-import (typed); this plugin isn't loaded by the test app
import { errorLogLine } from '../utils/error-log'

// Server faults as JSON lines in the app's log (docs/deploy.md, "When something goes wrong")
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const line = errorLogLine(error, event ? { method: event.method, path: event.path, school: event.context.school?.slug ?? null } : undefined)
    if (line) console.error(line)
  })
})
