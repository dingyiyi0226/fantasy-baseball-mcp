/**
 * Yahoo's XML-to-JSON output collapses a single repeated element into an object
 * and multiple into an array. Tools almost always want an array, so normalize.
 */
export function asArray<T = any>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Today's date as YYYY-MM-DD in the local timezone (Yahoo's `date=` format). */
export function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Coerce Yahoo's sometimes-numeric values back to a display string. */
export function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}
