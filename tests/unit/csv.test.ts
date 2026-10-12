import { describe, expect, it } from 'vitest'
import { CsvError, parseCsv } from '~~/server/utils/csv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('handles CRLF line endings and no trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('strips a UTF-8 byte order mark', () => {
    expect(parseCsv('\uFEFFname\nAda')).toEqual([['name'], ['Ada']])
  })

  it('keeps commas, quotes and newlines inside quoted fields', () => {
    expect(parseCsv('name,address\n"Obi, Ada","12 ""Palm"" Close\nIkeja"')).toEqual([
      ['name', 'address'],
      ['Obi, Ada', '12 "Palm" Close\nIkeja'],
    ])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3\n,,')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['', '', '']])
  })

  it('skips completely empty lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reports an unterminated quote with its line', () => {
    expect(() => parseCsv('a,b\n1,"open\n2,3')).toThrow(CsvError)
    expect(() => parseCsv('a,b\n1,"open\n2,3')).toThrow('Line 2: a quoted value is never closed')
  })

  it('returns no rows for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })
})
