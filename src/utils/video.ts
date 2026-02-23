/**
 * Generate a thumbnail data URL from a video blob.
 * Captures a frame at the specified time (default 1 second).
 * Times out after 10 seconds to avoid hanging indefinitely.
 */
export async function generateThumbnail(
  blob: Blob,
  timeSeconds: number = 1,
  width: number = 320,
  height: number = 180,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // M9: Timeout to prevent hanging if video never loads/seeks
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("Thumbnail generation timed out after 10s"));
    }, 10_000);

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);
    video.src = url;

    video.addEventListener("loadedmetadata", () => {
      // Clamp seek time to video duration
      const seekTime = Math.min(timeSeconds, video.duration * 0.5);
      video.currentTime = seekTime;
    });

    video.addEventListener("seeked", () => {
      clearTimeout(timeout);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    });

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for thumbnail"));
    });
  });
}

/**
 * Format a blob size to a human-readable string.
 */
export function formatBlobSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Trigger a browser download for a blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
