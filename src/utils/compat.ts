/** Browser capability checks for VidLog core features. */

export interface CompatCheck {
  feature: string;
  supported: boolean;
  required: boolean;
  message: string;
}

export function checkBrowserCompat(): CompatCheck[] {
  const checks: CompatCheck[] = [];

  // Camera access
  checks.push({
    feature: "Camera Access",
    supported: !!(navigator.mediaDevices?.getUserMedia),
    required: true,
    message: "getUserMedia API is needed for video recording.",
  });

  // MediaRecorder
  checks.push({
    feature: "Video Recording",
    supported: typeof MediaRecorder !== "undefined",
    required: true,
    message: "MediaRecorder API is needed to capture video.",
  });

  // Canvas captureStream
  const canvas = document.createElement("canvas");
  checks.push({
    feature: "Canvas Capture",
    supported: typeof canvas.captureStream === "function",
    required: true,
    message: "Canvas captureStream is needed for overlay compositing.",
  });

  // OPFS
  checks.push({
    feature: "Local Storage (OPFS)",
    supported: "storage" in navigator && "getDirectory" in navigator.storage,
    required: false,
    message:
      "Origin Private File System enables persistent local storage. Without it, recordings are in-memory only.",
  });

  // Service Worker (PWA)
  checks.push({
    feature: "Offline Support (PWA)",
    supported: "serviceWorker" in navigator,
    required: false,
    message: "Service workers enable offline usage and app installation.",
  });

  return checks;
}

/** Returns human-friendly camera error messages. */
export function getCameraErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to access camera.";

  const name = err.name;
  const msg = err.message.toLowerCase();

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Please allow camera access in your browser settings and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found. Please connect a camera and try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is already in use by another application. Please close other apps using your camera.";
  }
  if (name === "OverconstrainedError") {
    return "Camera does not support the requested resolution. Try a lower quality setting.";
  }
  if (name === "AbortError") {
    return "Camera access was interrupted. Please try again.";
  }
  if (msg.includes("secure") || msg.includes("https")) {
    return "Camera access requires a secure connection (HTTPS). Please access the app via HTTPS.";
  }

  return `Camera error: ${err.message}`;
}
