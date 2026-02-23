import { createSignal } from "solid-js";
import type { RecordingStatus } from "~/models/types";

const [status, setStatus] = createSignal<RecordingStatus>("idle");
const [elapsed, setElapsed] = createSignal(0);
const [error, setError] = createSignal<string | null>(null);
const [stream, setStream] = createSignal<MediaStream | null>(null);
const [selectedDeviceId, setSelectedDeviceId] = createSignal<string | null>(null);

export const recorderStore = {
  // Getters (signals)
  status,
  elapsed,
  error,
  stream,
  selectedDeviceId,

  // Setters
  setStatus,
  setElapsed,
  setError,
  setStream,
  setSelectedDeviceId,

  /** Reset all recording state to idle */
  reset() {
    setStatus("idle");
    setElapsed(0);
    setError(null);
    // Don't reset stream — camera stays active
  },
};
