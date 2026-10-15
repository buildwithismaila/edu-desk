<script setup lang="ts">
// Privacy notice (public). DRAFT for legal review: replace the [placeholders] before the pilot.
definePageMeta({ layout: 'print', public: true })
useHead({ title: 'Privacy' })
const { data: school } = await useSchool()
</script>

<template>
  <article
    data-testid="privacy"
    class="mx-auto max-w-3xl space-y-4 px-4 py-8 text-sm leading-6"
  >
    <UButton
      to="/login"
      label="Back"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2"
    />
    <h1 class="text-2xl font-semibold">
      Privacy notice
    </h1>
    <p class="text-muted">
      Last updated: [date]
    </p>

    <h2 class="text-lg font-semibold">
      Who we are
    </h2>
    <p>
      {{ school?.name ?? 'Your school' }} uses Edu Desk, an online school management system run by [Business name], to keep student, parent and staff records.
      The school decides what information it keeps and why: it is the <b>data controller</b> under the Nigeria Data Protection Act 2023.
      [Business name] stores and processes that information only to run Edu Desk for the school: it is the <b>data processor</b>.
    </p>

    <h2 class="text-lg font-semibold">
      What we keep
    </h2>
    <ul class="list-disc space-y-1 ps-6">
      <li><b>Students:</b> name, gender, date of birth, state of origin, address, photo, admission number, class, attendance, scores, report cards, fee bills and payments.</li>
      <li><b>Parents and guardians:</b> name, phone number, email, relationship to the student, and login details.</li>
      <li><b>Staff:</b> name, phone number, email, role and the classes and subjects they teach.</li>
    </ul>

    <h2 class="text-lg font-semibold">
      Why
    </h2>
    <p>
      To run the school: admissions, attendance, results and report cards, school fees and receipts, and to let parents see their own children's results, attendance and fees.
      The information is <b>not sold</b> and <b>not used for advertising</b>.
    </p>

    <h2 class="text-lg font-semibold">
      Who can see it
    </h2>
    <p>
      Each person sees only what their role needs: teachers see their own classes, the bursar sees fees but not results, and a parent sees only their own children.
      Each school's information is kept separate from every other school's.
      [Business name] staff access it only to keep the service running or when the school asks for help.
    </p>

    <h2 class="text-lg font-semibold">
      How it's protected
    </h2>
    <p>
      Connections are encrypted (HTTPS), passwords are stored scrambled (hashed), and backups are encrypted and kept off-site.
      Information is stored on servers in [country/region].
    </p>

    <h2 class="text-lg font-semibold">
      How long we keep it
    </h2>
    <p>
      For as long as the school uses Edu Desk. When the school stops, its information is returned to it and deleted within [30] days; backups expire within 8 weeks.
    </p>

    <h2 class="text-lg font-semibold">
      Your rights
    </h2>
    <p>
      You can ask to see, correct or delete information about you or your child. Ask the school office first: the school decides on requests.
      You can also contact [Business name] at [Contact email], or complain to the Nigeria Data Protection Commission.
    </p>

    <p class="border-t border-default pt-4 text-xs text-muted">
      Draft for legal review.
    </p>
  </article>
</template>
