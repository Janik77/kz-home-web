/** Compare Core's serialized instants without losing PostgreSQL microseconds. */
function parts(value: string): [number, string] | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const wall = Date.parse(`${match[1]}Z`);
  const instant = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(wall) || !Number.isFinite(instant) || new Date(wall).toISOString().slice(0, 19) !== match[1]) return null;
  return [instant, (match[2] ?? '').replace(/0+$/, '')];
}
export function sameCoreInstant(left: string | null | undefined, right: string | null | undefined): boolean {
  if (left === right) return true;
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = parts(left), b = parts(right);
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
}
