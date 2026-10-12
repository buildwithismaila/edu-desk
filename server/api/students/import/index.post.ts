import { createError, defineEventHandler } from 'h3'
import { z } from 'zod'
import { checkImport, importStudents, readImportFile } from '../../../services/student-import'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { validateQuery } from '../../../utils/validation'

const querySchema = z.object({ dryRun: z.stringbool().default(false) })

/**
 * Admin: import students from a CSV (multipart `file`). `?dryRun=true` only checks the file; a real
 * import re-checks it and imports everything in one transaction, or nothing if any row has an error.
 */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { dryRun } = validateQuery(event, querySchema)
  const table = await readImportFile(event)

  const db = useDb()
  const { session, rows, errors } = await checkImport(db, school, table)
  if (dryRun) return { valid: errors.length === 0, rows: rows.length, errors }
  if (errors.length) {
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Fix the errors in the file, then import it again', data: { errors } })
  }
  return importStudents(db, school, session, rows)
})
