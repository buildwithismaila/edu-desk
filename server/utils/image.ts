import { createError, getRequestHeader, type H3Event, readMultipartFormData } from 'h3'
import { fieldError } from './validation'

export type ImageType = 'png' | 'jpeg' | 'webp'

export const IMAGE_CONTENT_TYPES: Record<ImageType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const startsWith = (data: Uint8Array, signature: number[], offset = 0) =>
  data.length >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte)

const ascii = (text: string) => [...text].map(c => c.charCodeAt(0))

/** The image type from the file's signature (magic bytes), never from its name or claimed type. */
export function detectImageType(data: Uint8Array): ImageType | null {
  if (startsWith(data, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png'
  if (startsWith(data, [0xFF, 0xD8, 0xFF])) return 'jpeg'
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return 'webp'
  return null
}

/** Uploaded images (logos, student photos): at most 1 MB. */
export const IMAGE_MAX_BYTES = 1024 * 1024

/**
 * Reads a multipart image upload from `field`: 413 if over 1 MB, 400 unless it's really a PNG, JPEG
 * or WebP (checked by file signature, never by name or claimed type).
 */
export async function readImageUpload(event: H3Event, field: string) {
  const tooLarge = () => createError({ statusCode: 413, statusMessage: 'Payload Too Large', message: 'The image must be 1 MB or smaller' })
  // Refuse obviously oversized bodies before reading them (multipart overhead allowed)
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > IMAGE_MAX_BYTES + 64 * 1024) throw tooLarge()

  const file = (await readMultipartFormData(event))?.find(part => part.name === field)
  if (!file?.data.length) throw fieldError(field, 'Choose an image to upload')
  if (file.data.length > IMAGE_MAX_BYTES) throw tooLarge()

  const type = detectImageType(file.data)
  if (!type) throw fieldError(field, 'Upload a PNG, JPEG or WebP image')
  return { data: file.data, type }
}
