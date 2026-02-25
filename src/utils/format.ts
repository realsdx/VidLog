/**
 * Format a byte count into a human-readable string (e.g. "12.3 MB").
 *
 * This is the single canonical byte-formatter for the entire app.
 * Previously there were two near-identical copies: `formatBlobSize` (video.ts)
 * and `formatStorageSize` (opfs.ts). Both now re-export this function.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
