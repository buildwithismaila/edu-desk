// Report card traits (docs/domain.md), rated 1–5 by the class teacher. Fixed in the MVP (decision in
// docs/features/06-score-entry.md); keys are stored in trait_ratings.trait.

export const AFFECTIVE_TRAITS = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'politeness', label: 'Politeness' },
  { key: 'honesty', label: 'Honesty' },
  { key: 'relationship_with_others', label: 'Relationship with others' },
  { key: 'attentiveness', label: 'Attentiveness' },
] as const

export const PSYCHOMOTOR_TRAITS = [
  { key: 'handwriting', label: 'Handwriting' },
  { key: 'sports', label: 'Sports' },
  { key: 'drawing_crafts', label: 'Drawing & crafts' },
  { key: 'verbal_fluency', label: 'Verbal fluency' },
] as const

export const TRAIT_KEYS = [...AFFECTIVE_TRAITS, ...PSYCHOMOTOR_TRAITS].map(t => t.key) as [TraitKey, ...TraitKey[]]
export type TraitKey = typeof AFFECTIVE_TRAITS[number]['key'] | typeof PSYCHOMOTOR_TRAITS[number]['key']

/** Nursery: a skill rating per subject instead of numeric scores. */
export const NURSERY_RATINGS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good', label: 'Good' },
  { value: 'needs_improvement', label: 'Needs Improvement' },
] as const
export const NURSERY_RATING_VALUES = NURSERY_RATINGS.map(r => r.value) as [NurseryRating, ...NurseryRating[]]
export type NurseryRating = typeof NURSERY_RATINGS[number]['value']
