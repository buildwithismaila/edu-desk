<script setup lang="ts">
import { TERM_LABELS } from '#shared/constants/academics'
import { sessionNameSchema } from '#shared/schemas/academics'
import { SettingsTermDatesDialog } from '#components'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Calendar' })

const toast = useToast()
const confirm = useConfirmDialog()
const askName = useNameDialog()
const termDatesDialog = useOverlay().create(SettingsTermDatesDialog, { destroyOnClose: true })

const { data: sessions, refresh } = await useFetch('/api/sessions')
type Session = NonNullable<typeof sessions.value>[number]
type Term = Session['terms'][number]

async function newSession() {
  const created = await askName({
    title: 'New session',
    label: 'Session',
    placeholder: '2026/2027',
    schema: sessionNameSchema,
    submit: name => $fetch('/api/sessions', { method: 'POST', body: { name } }),
  })
  if (created) await refresh()
}

async function renameSession(session: Session) {
  const saved = await askName({
    title: 'Rename session',
    label: 'Session',
    value: session.name,
    schema: sessionNameSchema,
    submit: name => $fetch(`/api/sessions/${session.id}`, { method: 'PATCH', body: { name } }),
  })
  if (saved) await refresh()
}

async function deleteSession(session: Session) {
  const ok = await confirm({ title: `Delete ${session.name}?`, description: 'Its three terms will be deleted too.', confirmLabel: 'Delete' })
  if (!ok) return
  try {
    await $fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function editDates(session: Session, term: Term) {
  if (await termDatesDialog.open({ sessionName: session.name, term })) await refresh()
}

async function setCurrent(session: Session, term: Term) {
  try {
    await $fetch(`/api/terms/${term.id}/set-current`, { method: 'POST' })
    await Promise.all([refresh(), refreshNuxtData('current-term')])
    toast.add({ title: `${session.name} · ${TERM_LABELS[term.number]} is now current`, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

const dates = (term: Term) => term.startsOn || term.endsOn
  ? `${formatDate(term.startsOn) || '?'} – ${formatDate(term.endsOn) || '?'}`
  : 'Dates not set'
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Calendar
      </h1>
      <UButton
        data-testid="new-session"
        label="New session"
        icon="i-lucide-plus"
        @click="newSession"
      />
    </div>

    <p
      v-if="!sessions?.length"
      class="text-muted"
    >
      No sessions yet. Create one to set its terms.
    </p>

    <UCard
      v-for="session in sessions"
      :key="session.id"
      :data-testid="`session-${session.name}`"
    >
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-semibold">
            {{ session.name }}
          </h2>
          <UBadge
            v-if="session.isCurrent"
            label="Current session"
            color="primary"
            variant="subtle"
          />
          <div class="ms-auto flex gap-1">
            <UButton
              icon="i-lucide-pencil"
              :aria-label="`Rename ${session.name}`"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="renameSession(session)"
            />
            <UButton
              icon="i-lucide-trash"
              :aria-label="`Delete ${session.name}`"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="session.isCurrent"
              @click="deleteSession(session)"
            />
          </div>
        </div>
      </template>

      <ul class="divide-y divide-default">
        <li
          v-for="term in session.terms"
          :key="term.id"
          :data-testid="`term-${session.name}-${term.number}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
        >
          <div class="min-w-40 flex-1">
            <p class="font-medium">
              {{ TERM_LABELS[term.number] }}
              <UBadge
                v-if="term.isCurrent"
                data-testid="current-term-badge"
                class="ms-1"
                label="Current"
                color="primary"
                variant="subtle"
                size="sm"
              />
            </p>
            <p class="text-sm text-muted">
              {{ dates(term) }}
              <template v-if="term.nextTermBeginsOn">
                · Next term begins {{ formatDate(term.nextTermBeginsOn) }}
              </template>
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              data-testid="edit-term-dates"
              label="Edit dates"
              color="neutral"
              variant="outline"
              size="sm"
              @click="editDates(session, term)"
            />
            <UButton
              v-if="!term.isCurrent"
              data-testid="set-current-term"
              label="Set as current"
              size="sm"
              @click="setCurrent(session, term)"
            />
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
