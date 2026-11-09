/** Random ids for records created in the browser (demo mode only). */
export function uid(prefix = ''): string {
  const crypto = globalThis.crypto;
  const core =
    crypto && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${core}` : core;
}
