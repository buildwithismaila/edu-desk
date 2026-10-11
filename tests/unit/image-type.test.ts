import { describe, expect, it } from 'vitest'
import { detectImageType } from '~~/server/utils/image'

const bytes = (...values: number[]) => new Uint8Array([...values, ...Array.from({ length: 16 }, () => 0)])
const ascii = (text: string) => new TextEncoder().encode(text)

describe('detectImageType', () => {
  it('detects PNG', () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))).toBe('png')
  })

  it('detects JPEG', () => {
    expect(detectImageType(bytes(0xFF, 0xD8, 0xFF, 0xE0))).toBe('jpeg')
  })

  it('detects WebP', () => {
    const riff = ascii('RIFF')
    const webp = new Uint8Array([...riff, 0x24, 0x00, 0x00, 0x00, ...ascii('WEBPVP8 ')])
    expect(detectImageType(webp)).toBe('webp')
  })

  it.each([
    ['GIF', ascii('GIF89a......')],
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a text file renamed to .png', ascii('hello, this is not an image')],
    ['a RIFF file that is not WebP', new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')])],
    ['an empty file', new Uint8Array()],
    ['a truncated PNG header', new Uint8Array([0x89, 0x50, 0x4E])],
  ])('rejects %s', (_case, data) => {
    expect(detectImageType(data)).toBeNull()
  })
})
