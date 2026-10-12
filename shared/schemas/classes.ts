import { z } from 'zod'
import { SECTIONS } from '../constants/academics'

export const classLevelNameSchema = z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters')
export const classArmNameSchema = z.string().trim().min(1, 'Enter a name').max(20, 'Use at most 20 characters')

export const createClassLevelSchema = z.object({
  section: z.enum(SECTIONS, 'Choose a section'),
  name: classLevelNameSchema,
})

export const renameClassLevelSchema = z.object({ name: classLevelNameSchema })

export const classArmSchema = z.object({ name: classArmNameSchema })

/** Every one of the school's class level ids, in the new order. */
export const classLevelOrderSchema = z.object({ ids: z.array(z.uuid()).min(1) })
