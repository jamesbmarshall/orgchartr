const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

/** Generates a URL-safe random identifier using Web Crypto in browsers and Node 22+. */
export function randomId(size = 21): string {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('ID size must be a positive integer');
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte & 63];
  return id;
}

/**
 * Chart IDs are produced by slugify() + optional nanoid suffix, so they only ever contain
 * lowercase letters, digits, and hyphens. Enforcing that shape keeps a request-supplied id from
 * ever escaping the charts directory via path segments like "../" or absolute/Windows paths.
 */
export const CHART_ID_PATTERN = /^[a-z0-9-]+$/;

export function isValidChartId(id: unknown): id is string {
  return typeof id === 'string' && CHART_ID_PATTERN.test(id);
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'chart';
}

/** Derives a chart id from the partner name, suffixing a random segment until it is unique. */
export function uniqueChartId(partnerName: string, existingIds: ReadonlySet<string>): string {
  const base = slugify(partnerName);
  let id = base;
  while (existingIds.has(id)) id = `${base}-${randomId(5).toLowerCase()}`;
  return id;
}
