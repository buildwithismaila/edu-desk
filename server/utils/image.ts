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
