/** Generate a UUID using the native crypto API */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a human-readable, date-prefixed ID for filesystem storage.
 * Format: 2026-02-23_143207_a3f7  (date_HHMMSS_4-hex)
 *
 * Structurally different from UUIDs, making cross-provider ID collision impossible.
 * The 4-char hex suffix avoids collisions for entries created in the same second.
 */
export function generateFilesystemId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // 2026-02-23
  const time = now.toTimeString().slice(0, 8).replace(/:/g, ""); // 143207
  const hex = Math.random().toString(16).slice(2, 6); // a3f7
  return `${date}_${time}_${hex}`;
}
