/**
 * Image type detection by magic bytes (file signature), shared by the photo-upload and
 * package-import paths. Never trust a client-supplied filename extension or Content-Type to
 * decide how a file is stored or served: a `.html`/`.svg` payload with an `image/png`
 * Content-Type would otherwise be persisted and served as active content from our own origin.
 */

/** Canonical stored extension for each supported image type. */
export type ImageExtension = '.png' | '.jpg' | '.gif' | '.webp';

/** Extensions accepted for a stored/referenced photo filename (includes legacy `.jpeg`). */
export const ALLOWED_PHOTO_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

/** Lowercased extension (".png") of a filename, or '' when it has none. */
export function photoExtension(value: string): string {
  const dot = value.lastIndexOf('.');
  return dot === -1 ? '' : value.slice(dot).toLowerCase();
}

/**
 * A stored photo reference must be a bare filename (no path segments) with an allowed image
 * extension. Rejecting anything else keeps a client from pointing `photo` at `../../etc/passwd`
 * or another file that `/photos` static serving would otherwise resolve.
 */
export function isStoredPhotoName(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && !value.includes('/')
    && !value.includes('\\')
    && ALLOWED_PHOTO_EXTENSIONS.has(photoExtension(value))
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(data: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(data[i]);
  return out;
}

/** Returns the canonical extension for the image the buffer actually contains, or null. */
export function sniffImageExtension(data: Uint8Array): ImageExtension | null {
  if (data.length >= 8 && PNG_SIGNATURE.every((byte, i) => data[i] === byte)) return '.png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(data, 0, 6))) return '.gif';
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') {
    return '.webp';
  }
  return null;
}
