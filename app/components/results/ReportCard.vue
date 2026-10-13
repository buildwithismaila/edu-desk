<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'

type Report = InternalApi['/api/students/:id/report-card']['get']

// One A4 report card (docs/domain.md → Report card contents). Print pages put one per page.
const props = defineProps<{ report: Report }>()

const ordinal = (n: number) => {
  const rem = n % 100
  if (rem >= 11 && rem <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}
const termTitle = computed(() => `${TERM_LABELS[props.report.term.number]} · ${props.report.term.sessionName}`)
const cell = (value: number | 'ABS' | null) => value === null ? '—' : String(value)
</script>

<template>
  <article
    data-testid="report-card"
    class="report-card mx-auto w-full max-w-[190mm] space-y-4 bg-white p-4 text-[13px] leading-snug text-black sm:p-6"
  >
    <header class="flex items-center gap-4 border-b-2 border-black pb-3">
      <img
        v-if="report.school.logoUrl"
        :src="report.school.logoUrl"
        alt=""
        class="size-16 object-contain"
      >
      <div class="flex-1 text-center">
        <h1 class="text-xl font-bold uppercase">
          {{ report.school.name }}
        </h1>
        <p v-if="report.school.address">
          {{ report.school.address }}
        </p>
        <p
          v-if="report.school.motto"
          class="italic"
        >
          “{{ report.school.motto }}”
        </p>
        <p class="mt-1 font-semibold uppercase">
          Report card · {{ termTitle }}
        </p>
      </div>
    </header>

    <section class="flex gap-4">
      <img
        v-if="report.student.photoUrl"
        :src="report.student.photoUrl"
        alt=""
        class="h-24 w-20 rounded object-cover"
      >
      <dl class="grid flex-1 grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <dt class="text-xs uppercase text-gray-500">
            Name
          </dt>
          <dd
            data-testid="report-card-name"
            class="font-semibold"
          >
            {{ report.student.name }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500">
            Admission no.
          </dt>
          <dd>{{ report.student.admissionNumber }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500">
            Class
          </dt>
          <dd>{{ report.arm.label }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500">
            Next term begins
          </dt>
          <dd>{{ formatDate(report.term.nextTermBeginsOn) || '—' }}</dd>
        </div>
      </dl>
    </section>

    <div
      v-if="report.mode === 'scores'"
      class="overflow-x-auto"
    >
      <table
        data-testid="report-card-subjects"
        class="w-full border-collapse"
      >
        <thead>
          <tr class="bg-gray-100">
            <th class="border border-gray-400 px-2 py-1 text-left">
              Subject
            </th>
            <th
              v-for="component in report.components"
              :key="component.id"
              class="border border-gray-400 px-1 py-1"
            >
              {{ component.name }}<span class="block text-[10px] font-normal">/{{ component.maxScore }}</span>
            </th>
            <th class="border border-gray-400 px-1 py-1">
              Total
            </th>
            <th class="border border-gray-400 px-1 py-1">
              Grade
            </th>
            <th
              v-if="report.summary.showPositions"
              class="border border-gray-400 px-1 py-1"
            >
              Pos.
            </th>
            <th class="border border-gray-400 px-2 py-1 text-left">
              Remark
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="subject in report.subjects"
            :key="subject.id"
          >
            <td class="border border-gray-400 px-2 py-1">
              {{ subject.name }}
            </td>
            <td
              v-for="(value, i) in subject.cells"
              :key="i"
              class="border border-gray-400 px-1 py-1 text-center"
            >
              {{ cell(value) }}
            </td>
            <td class="border border-gray-400 px-1 py-1 text-center font-semibold">
              {{ subject.total }}
            </td>
            <td class="border border-gray-400 px-1 py-1 text-center">
              {{ subject.grade ?? '—' }}
            </td>
            <td
              v-if="report.summary.showPositions"
              class="border border-gray-400 px-1 py-1 text-center"
            >
              {{ subject.position ? ordinal(subject.position) : '—' }}
            </td>
            <td class="border border-gray-400 px-2 py-1">
              {{ subject.remark ?? '' }}
            </td>
          </tr>
          <tr v-if="!report.subjects.length">
            <td
              :colspan="report.components.length + 5"
              class="border border-gray-400 px-2 py-2 text-center text-gray-500"
            >
              No scores recorded for this term.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <table
      v-else
      data-testid="report-card-skills"
      class="w-full border-collapse"
    >
      <thead>
        <tr class="bg-gray-100">
          <th class="border border-gray-400 px-2 py-1 text-left">
            Learning area
          </th>
          <th class="border border-gray-400 px-2 py-1 text-left">
            Rating
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="rating in report.nurseryRatings"
          :key="rating.subject"
        >
          <td class="border border-gray-400 px-2 py-1">
            {{ rating.subject }}
          </td>
          <td class="border border-gray-400 px-2 py-1">
            {{ rating.rating }}
          </td>
        </tr>
      </tbody>
    </table>

    <section
      v-if="report.mode === 'scores'"
      data-testid="report-card-summary"
      class="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <p><span class="text-gray-500">Total:</span> <strong>{{ report.summary.total ?? '—' }}</strong></p>
      <p><span class="text-gray-500">Average:</span> <strong>{{ report.summary.average?.toFixed(2) ?? '—' }}</strong></p>
      <p v-if="report.summary.showPositions">
        <span class="text-gray-500">Position:</span>
        <strong data-testid="report-card-position">{{ report.summary.position ? ordinal(report.summary.position) : '—' }}</strong>
        <span class="text-gray-500"> of {{ report.summary.numberInClass }}</span>
      </p>
      <p v-else>
        <span class="text-gray-500">Number in class:</span> <strong>{{ report.summary.numberInClass }}</strong>
      </p>
      <p><span class="text-gray-500">Subjects:</span> <strong>{{ report.summary.offered }}</strong></p>
      <p
        v-if="report.summary.cumulativeAverage !== null"
        class="col-span-2"
      >
        <span class="text-gray-500">Cumulative average (session):</span> <strong>{{ report.summary.cumulativeAverage.toFixed(2) }}</strong>
      </p>
    </section>

    <section class="grid gap-4 sm:grid-cols-3">
      <div>
        <h2 class="mb-1 font-semibold uppercase">
          Attendance
        </h2>
        <p data-testid="report-card-attendance">
          Present {{ report.attendance.present }} of {{ report.attendance.opened }} days
        </p>
        <p class="text-gray-500">
          Absent {{ report.attendance.absent }} · Late {{ report.attendance.late }}
        </p>
      </div>
      <div
        v-for="group in [{ title: 'Affective', traits: report.traits.affective }, { title: 'Psychomotor', traits: report.traits.psychomotor }]"
        :key="group.title"
      >
        <h2 class="mb-1 font-semibold uppercase">
          {{ group.title }}
        </h2>
        <table class="w-full border-collapse">
          <tbody>
            <tr
              v-for="trait in group.traits"
              :key="trait.label"
            >
              <td class="border border-gray-300 px-1.5 py-0.5">
                {{ trait.label }}
              </td>
              <td class="w-8 border border-gray-300 px-1.5 py-0.5 text-center">
                {{ trait.rating ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-2">
      <p>
        <span class="font-semibold">Class teacher's comment:</span>
        <span data-testid="report-card-class-teacher-comment">{{ report.comments.classTeacher ?? '—' }}</span>
      </p>
      <p>
        <span class="font-semibold">Principal's comment:</span>
        <span data-testid="report-card-principal-comment">{{ report.comments.principal ?? '—' }}</span>
      </p>
    </section>

    <p
      v-if="report.fees && report.fees.balanceKobo !== null"
      data-testid="report-card-fees"
    >
      <span class="font-semibold">{{ report.fees.balanceKobo > 0 ? 'Outstanding fees' : report.fees.balanceKobo < 0 ? 'Fees credit' : 'Fees' }}:</span>
      {{ report.fees.balanceKobo === 0 ? 'Fully paid' : formatNaira(Math.abs(report.fees.balanceKobo)) }}
    </p>

    <footer class="border-t border-gray-300 pt-2 text-xs text-gray-500">
      Ratings: 5 Excellent · 4 Very good · 3 Good · 2 Fair · 1 Poor
      <template v-if="report.status !== 'published'">
        · <strong class="text-black">Draft — not yet published</strong>
      </template>
    </footer>
  </article>
</template>

<style>
@media print {
  .report-card {
    break-after: page;
    max-width: none;
    padding: 0;
  }
  .report-card:last-of-type {
    break-after: auto;
  }
}
</style>
