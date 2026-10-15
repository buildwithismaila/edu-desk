<script setup lang="ts">
// Terms of use (public). DRAFT for legal review: replace the [placeholders] before the pilot.
definePageMeta({ layout: 'print', public: true })
useHead({ title: 'Terms of use' })
const { data: school } = await useSchool()
</script>

<template>
  <article
    data-testid="terms"
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
      Terms of use
    </h1>
    <p class="text-muted">
      Last updated: [date]
    </p>

    <p>
      Edu Desk is provided to {{ school?.name ?? 'your school' }} by [Business name]. By logging in you agree to these terms.
    </p>

    <h2 class="text-lg font-semibold">
      Your account
    </h2>
    <ul class="list-disc space-y-1 ps-6">
      <li>Your login is personal. Keep your password private and don't share your account.</li>
      <li>If you were given a temporary password, choose your own the first time you log in.</li>
      <li>If you think someone else knows your password, ask the school office to reset it.</li>
    </ul>

    <h2 class="text-lg font-semibold">
      Using Edu Desk
    </h2>
    <ul class="list-disc space-y-1 ps-6">
      <li>Use it only for school purposes, and only to see or change what your role allows.</li>
      <li>Staff: enter information accurately. Scores, payments and results are recorded with who entered them.</li>
      <li>Don't try to get into other people's information, other schools' information, or to disrupt the service.</li>
    </ul>

    <h2 class="text-lg font-semibold">
      Information and privacy
    </h2>
    <p>
      The school is responsible for the information it keeps in Edu Desk. How it is used and protected is explained in the <NuxtLink
        to="/privacy"
        class="text-primary underline"
      >privacy notice</NuxtLink>.
    </p>

    <h2 class="text-lg font-semibold">
      Availability
    </h2>
    <p>
      We work to keep Edu Desk available and backed up, but there may be short interruptions for maintenance or problems outside our control.
      Questions about results, fees or your child's records go to the school office.
    </p>

    <h2 class="text-lg font-semibold">
      Contact
    </h2>
    <p>
      [Business name], [address], [Contact email].
    </p>

    <p class="border-t border-default pt-4 text-xs text-muted">
      Draft for legal review.
    </p>
  </article>
</template>
