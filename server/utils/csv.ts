export class CsvError extends Error {}

/**
 * Minimal RFC 4180 parser for student imports: quoted fields (with "" escapes, commas and newlines
 * inside), CRLF or LF, UTF-8 BOM stripped, completely empty lines skipped. Returns rows of strings.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let quoteStartLine = 1

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      }
      else if (char === '"') {
        quoted = false
      }
      else {
        if (char === '\n') line++
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      quoteStartLine = line
    }
    else if (char === ',') {
      endField()
    }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      endRow()
      line++
    }
    else {
      field += char
    }
  }

  if (quoted) throw new CsvError(`Line ${quoteStartLine}: a quoted value is never closed`)
  if (field !== '' || row.length) endRow()
  return rows
}
