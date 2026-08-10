/**
 * Small request-body field validators shared by the CRUD paths (Express routes in server mode,
 * the local-folder adapter in the browser). The package-import path has its own strict parsers.
 */

/** Thrown by a validator when a field has the wrong shape; callers turn it into a user-facing error. */
export class ValidationError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Requires a non-empty string; returns it trimmed. */
export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

/** Requires a string (empty allowed); returns it unchanged. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  return value;
}

/** Requires an array of strings; returns it unchanged. */
export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError(`${field} must be an array of strings`);
  }
  return value as string[];
}

/** Requires null or a finite {x, y} position; returns the normalised value. */
export function requirePosition(value: unknown): { x: number; y: number } | null {
  if (value === null) return null;
  if (
    !isRecord(value)
    || typeof value.x !== 'number'
    || !Number.isFinite(value.x)
    || typeof value.y !== 'number'
    || !Number.isFinite(value.y)
  ) {
    throw new ValidationError('position must be null or an object with numeric x and y');
  }
  return { x: value.x, y: value.y };
}
