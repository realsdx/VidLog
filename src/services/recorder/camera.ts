export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Request camera access with the given constraints.
 * Returns a MediaStream with video + audio tracks.
 */
export async function requestCamera(
  deviceId?: string,
  resolution?: { width: number; height: number },
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: resolution?.width ?? 1280 },
      height: { ideal: resolution?.height ?? 720 },
      facingMode: "user",
    },
    audio: true,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Enumerate available video input devices.
 * Note: labels may be empty until permission is granted.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }));
}

/**
 * Stop all tracks on a MediaStream.
 */
export function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
