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

/**
 * Derive a file extension from a MIME type string.
 * Returns the extension WITH the leading dot (e.g. ".mp4", ".webm").
 */
export function getExtensionForMimeType(mime: string): string {
  if (mime.startsWith("video/mp4")) return ".mp4";
  if (mime.startsWith("video/webm")) return ".webm";
  return ".webm"; // safe default — WebM is universally supported for recording
}
