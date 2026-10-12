<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { SECTION_LABELS, SECTIONS, type Section } from '#shared/constants/academics'
import { classArmNameSchema, classLevelNameSchema } from '#shared/schemas/classes'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Classes' })

const toast = useToast()
const confirm = useConfirmDialog()
const askName = useNameDialog()

const { data: levels, refresh } = await useFetch('/api/class-levels')
type Level = NonNullable<typeof levels.value>[number]
type Arm = Level['arms'][number]

const sections = computed(() => SECTIONS.map(section => ({
  section,
  levels: (levels.value ?? []).filter(l => l.section === section),
})))

// `() => unknown` (not Promise<unknown>): see NameDialogOptions.submit (TS2321)
async function run(action: () => unknown) {
  try {
    await action()
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function addLevel(section: Section) {
  const saved = await askName({
    title: `New ${SECTION_LABELS[section]} class level`,
    label: 'Name',
    placeholder: section === 'jss' ? 'JSS 4' : undefined,
    schema: classLevelNameSchema,
    submit: name => $fetch('/api/class-levels', { method: 'POST', body: { section, name } }),
  })
  if (saved) await refresh()
}

async function renameLevel(level: Level) {
  const saved = await askName({
    title: 'Rename class level',
    label: 'Name',
    value: level.name,
    schema: classLevelNameSchema,
    submit: name => $fetch(`/api/class-levels/${level.id}`, { method: 'PATCH', body: { name } }),
  })
  if (saved) await refresh()
}

async function deleteLevel(level: Level) {
  if (!await confirm({ title: `Delete ${level.name}?`, confirmLabel: 'Delete' })) return
  await run(() => $fetch(`/api/class-levels/${level.id}`, { method: 'DELETE' }))
}

/** Swaps the level with its neighbour in the same section and saves the whole order. */
async function move(level: Level, direction: -1 | 1) {
  const ordered = sections.value.flatMap(s => s.levels)
  const index = ordered.findIndex(l => l.id === level.id)
  const neighbour = ordered[index + direction]
  if (!neighbour || neighbour.section !== level.section) return
  ordered[index] = neighbour
  ordered[index + direction] = level
  await run(() => $fetch('/api/class-levels/order', { method: 'PUT', body: { ids: ordered.map(l => l.id) } }))
}

const isFirst = (list: Level[], level: Level) => list[0]?.id === level.id
const isLast = (list: Level[], level: Level) => list.at(-1)?.id === level.id

async function addArm(level: Level) {
  const saved = await askName({
    title: `New arm for ${level.name}`,
    label: 'Arm',
    placeholder: 'A, B, Gold…',
    schema: classArmNameSchema,
    submit: name => $fetch(`/api/class-levels/${level.id}/arms`, { method: 'POST', body: { name } }),
  })
  if (saved) await refresh()
}

function armMenu(arm: Arm): DropdownMenuItem[] {
  return [
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        const saved = await askName({
          title: `Rename ${arm.label}`,
          label: 'Arm',
          value: arm.name,
          schema: classArmNameSchema,
          submit: name => $fetch(`/api/class-arms/${arm.id}`, { method: 'PATCH', body: { name } }),
        })
        if (saved) await refresh()
      },
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect: async () => {
        if (!await confirm({ title: `Delete ${arm.label}?`, confirmLabel: 'Delete' })) return
        await run(() => $fetch(`/api/class-arms/${arm.id}`, { method: 'DELETE' }))
      },
    },
  ]
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">
      Classes
    </h1>

    <UCard
      v-for="{ section, levels: sectionLevels } in sections"
      :key="section"
      :data-testid="`section-${section}`"
    >
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">
            {{ SECTION_LABELS[section] }}
          </h2>
          <UButton
            :data-testid="`add-level-${section}`"
            label="Add class level"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addLevel(section)"
          />
        </div>
      </template>

      <p
        v-if="!sectionLevels.length"
        class="text-sm text-muted"
      >
        No class levels in this section.
      </p>

      <ul class="divide-y divide-default">
        <li
          v-for="level in sectionLevels"
          :key="level.id"
          :data-testid="`level-${level.name}`"
          class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
        >
          <p class="w-32 shrink-0 font-medium">
            {{ level.name }}
          </p>

          <div class="flex flex-1 flex-wrap items-center gap-1">
            <UDropdownMenu
              v-for="arm in level.arms"
              :key="arm.id"
              :items="armMenu(arm)"
            >
              <UButton
                :data-testid="`arm-${arm.label}`"
                :label="arm.name"
                color="neutral"
                variant="soft"
                size="xs"
                trailing-icon="i-lucide-chevron-down"
              />
            </UDropdownMenu>
            <UButton
              :data-testid="`add-arm-${level.name}`"
              icon="i-lucide-plus"
              label="Arm"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="addArm(level)"
            />
          </div>

          <div class="flex gap-1">
            <UButton
              icon="i-lucide-arrow-up"
              :aria-label="`Move ${level.name} up`"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="isFirst(sectionLevels, level)"
              @click="move(level, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              :aria-label="`Move ${level.name} down`"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="isLast(sectionLevels, level)"
              @click="move(level, 1)"
            />
            <UButton
              icon="i-lucide-pencil"
              :aria-label="`Rename ${level.name}`"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="renameLevel(level)"
            />
            <UTooltip
              :text="level.arms.length ? 'Delete its arms first' : undefined"
              :disabled="!level.arms.length"
            >
              <UButton
                icon="i-lucide-trash"
                :aria-label="`Delete ${level.name}`"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="level.arms.length > 0"
                @click="deleteLevel(level)"
              />
            </UTooltip>
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
