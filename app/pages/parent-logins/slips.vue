<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// Printable login slips, 8 per A4 page. The passwords exist only in this page's memory: they were returned
// once by POST /api/parent-logins and are never stored or shown again.
definePageMeta({ roles: ['admin'], layout: 'print' })
useHead({ title: 'Parent login slips' })

type Generated = InternalApi['/api/parent-logins']['post']

const slips = useState<Generated | null>('parent-login-slips', () => null)
const { data: school } = await useSchool()
// The address parents type: this school's own address, as the admin sees it
const address = ref('')
onMounted(() => {
  address.value = window.location.host
})
const pages = computed(() => {
  const all = slips.value?.slips ?? []
  return Array.from({ length: Math.ceil(all.length / 8) }, (_, i) => all.slice(i * 8, i * 8 + 8))
})
const print = () => window.print()
function done() {
  slips.value = null
  return navigateTo('/parent-logins')
}
</script>

<template>
  <div class="space-y-4 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        label="Done"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        @click="done"
      />
      <UButton
        v-if="pages.length"
        data-testid="print"
        label="Print slips"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <UAlert
      v-if="pages.length"
      class="no-print mx-auto max-w-[190mm]"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Print now: these passwords are shown only once"
      :description="`${slips!.slips.length} slip(s). If you leave this page before printing, generate new logins for those parents.`"
    />
    <p
      v-else
      data-testid="slips-empty"
      class="px-4 text-center"
    >
      No slips to print. Generate logins on the Parent logins page.
    </p>

    <section
      v-for="(group, p) in pages"
      :key="p"
      class="mx-auto grid w-full max-w-[190mm] grid-cols-2 bg-white text-black"
      :style="p < pages.length - 1 ? 'break-after: page' : undefined"
    >
      <article
        v-for="slip in group"
        :key="slip.guardianId"
        data-testid="login-slip"
        class="flex h-[68mm] flex-col gap-1 border border-dashed border-gray-400 p-4 text-[12px]"
      >
        <header class="flex items-center gap-2 border-b border-gray-300 pb-1">
          <img
            v-if="school?.logoUrl"
            :src="school.logoUrl"
            alt=""
            class="size-8 object-contain"
          >
          <div>
            <p class="font-bold uppercase">
              {{ school?.name }}
            </p>
            <p class="text-[11px] text-gray-600">
              Parent login
            </p>
          </div>
        </header>
        <p class="mt-1 font-semibold">
          {{ slip.name }}
        </p>
        <p class="text-gray-600">
          For: {{ slip.children.map(c => c.name).join(', ') || '—' }}
        </p>
        <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-2">
          <dt class="text-gray-600">
            Website
          </dt>
          <dd class="font-semibold">
            {{ address }}
          </dd>
          <dt class="text-gray-600">
            Username
          </dt>
          <dd class="font-semibold">
            {{ slip.phone ?? slip.email }}
          </dd>
          <dt class="text-gray-600">
            Password
          </dt>
          <dd
            data-testid="slip-password"
            class="font-mono text-[14px] font-bold tracking-wider"
          >
            {{ slip.temporaryPassword }}
          </dd>
        </dl>
        <p class="mt-auto text-[11px] text-gray-600">
          You'll choose your own password the first time you log in. Keep this slip private.
        </p>
      </article>
    </section>
  </div>
</template>
