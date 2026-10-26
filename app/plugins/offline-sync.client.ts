// Sends registers saved offline (docs/features/10c-offline-attendance.md): when the app opens, when the phone
// comes back online, and every minute while some are waiting (weak signal doesn't always fire `online`).
export default defineNuxtPlugin((nuxtApp) => {
  const { loggedIn } = useUserSession()
  const online = useOnline()
  const { waiting, refreshOutbox, sendNow } = useOfflineAttendance()

  async function trySend() {
    if (!loggedIn.value) return
    await refreshOutbox()
    if (online.value && waiting.value.length) await sendNow({ quiet: true })
  }

  nuxtApp.hook('app:mounted', () => {
    trySend()
    watch([online, loggedIn], trySend)
    setInterval(() => {
      if (waiting.value.length) trySend()
    }, 60_000)
  })
})
