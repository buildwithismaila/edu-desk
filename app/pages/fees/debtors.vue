<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// Printable debtors list: who owes for the term (a class or the whole school), largest first.
definePageMeta({ roles: ['admin', 'bursar', 'principal'], layout: 'print' })
useHead({ title: 'Debtors' })

type Debtors = InternalApi['/api/fees/debtors']['get']

const route = useRoute()
const router = useRouter()
const text = (v: unknown) => typeof v === 'string' && v ? v : undefined
const termId = computed({ get: () => text(route.query.term), set: v => router.replace({ query: { ...route.query, term: v } }) })
const armId = computed({ get: () => text(route.query.arm) ?? 'all', set: v => router.replace({ query: { ...route.query, arm: v === 'all' ? undefined : v } }) })
const { armItems } = useClassArms()

const requestFetch = useRequestFetch()
const { data } = await useAsyncData('debtors', () => requestFetch<Debtors>('/api/fees/debtors', {
  query: { ...(termId.value ? { termId: termId.value } : {}), ...(armId.value !== 'all' ? { classArmId: armId.value } : {}) },
}), { watch: [termId, armId] })
const armLabel = computed(() => armItems.value.find(a => a.value === armId.value)?.label ?? 'All classes')
const print = () => window.print()
</script>

<template>
  <div class="mx-auto max-w-[190mm] space-y-4 p-4 text-black">
    <div class="no-print flex flex-wrap items-center gap-2">
      <UButton
        to="/fees/bills"
        label="Bills"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <div class="flex flex-1 flex-wrap justify-end gap-2">
        <FeesTermSelect v-model="termId" />
        <USelect
          v-model="armId"
          :items="[{ label: 'All classes', value: 'all' }, ...armItems]"
          class="w-full sm:w-44"
        />
        <UButton
          label="Print"
          icon="i-lucide-printer"
          @click="print"
        />
      </div>
    </div>

    <template v-if="data">
      <div class="flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-2">
        <h1 class="text-lg font-bold">
          Debtors · {{ armLabel }} · {{ data.term.label }}
        </h1>
        <p
          data-testid="debtors-total"
          class="font-semibold tabular-nums"
        >
          {{ data.count }} {{ data.count === 1 ? 'student owes' : 'students owe' }} {{ formatNaira(data.totalKobo) }}
        </p>
      </div>
      <div class="overflow-x-auto">
        <table
          data-testid="debtors-table"
          class="w-full border-collapse text-sm"
        >
          <thead>
            <tr class="bg-gray-100 text-left">
              <th class="border border-gray-400 px-2 py-1">
                Student
              </th>
              <th class="border border-gray-400 px-2 py-1">
                Class
              </th>
              <th class="border border-gray-400 px-2 py-1 text-right">
                Billed
              </th>
              <th class="border border-gray-400 px-2 py-1 text-right">
                Paid
              </th>
              <th class="border border-gray-400 px-2 py-1 text-right">
                Owing
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in data.students"
              :key="d.billId"
            >
              <td class="border border-gray-400 px-2 py-1">
                <NuxtLink
                  :to="`/students/${d.studentId}/fees`"
                  class="hover:underline"
                >
                  {{ d.name }}
                </NuxtLink>
                <span class="text-xs text-gray-500"> {{ d.admissionNumber }}{{ d.removed ? ' · removed' : '' }}</span>
              </td>
              <td class="border border-gray-400 px-2 py-1">
                {{ d.classLabel }}
              </td>
              <td class="border border-gray-400 px-2 py-1 text-right tabular-nums">
                {{ formatNaira(d.billed - d.discount) }}
              </td>
              <td class="border border-gray-400 px-2 py-1 text-right tabular-nums">
                {{ formatNaira(d.paid) }}
              </td>
              <td class="border border-gray-400 px-2 py-1 text-right font-semibold tabular-nums">
                {{ formatNaira(d.balance) }}
              </td>
            </tr>
            <tr v-if="!data.students.length">
              <td
                colspan="5"
                class="border border-gray-400 px-2 py-2 text-center"
              >
                Nobody owes for this term.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
