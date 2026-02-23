import { Show } from "solid-js";
import { recorderStore } from "~/stores/recorder";
import { formatDuration } from "~/utils/time";
import Button from "~/components/ui/Button";

interface RecordingControlsProps {
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export default function RecordingControls(props: RecordingControlsProps) {
  const status = recorderStore.status;
  const elapsed = recorderStore.elapsed;

  return (
    <div class="flex items-center gap-4" role="toolbar" aria-label="Recording controls">
      {/* Timer display */}
      <Show when={status() === "recording" || status() === "paused"}>
        <div class="font-mono text-lg text-text-primary tabular-nums min-w-[80px]" role="timer" aria-label={`Elapsed time: ${formatDuration(elapsed())}`}>
          <Show when={status() === "recording"}>
            <span class="inline-block w-2 h-2 rounded-full bg-accent-red animate-pulse-rec mr-2" aria-hidden="true" />
          </Show>
          <Show when={status() === "paused"}>
            <span class="inline-block w-2 h-2 rounded-full bg-accent-amber mr-2" aria-hidden="true" />
          </Show>
          {formatDuration(elapsed())}
        </div>
      </Show>

      {/* Control buttons */}
      <Show when={status() === "idle" || status() === "ready"}>
        <Button variant="primary" size="lg" onClick={props.onStart}>
          <RecIcon />
          Start Recording
        </Button>
      </Show>

      <Show when={status() === "recording"}>
        <Button variant="secondary" size="md" onClick={props.onPause}>
          <PauseIcon />
          Pause
        </Button>
        <Button variant="danger" size="md" onClick={props.onStop}>
          <StopIcon />
          Stop
        </Button>
      </Show>

      <Show when={status() === "paused"}>
        <Button variant="primary" size="md" onClick={props.onResume}>
          <ResumeIcon />
          Resume
        </Button>
        <Button variant="danger" size="md" onClick={props.onStop}>
          <StopIcon />
          Stop
        </Button>
      </Show>
    </div>
  );
}

// Simple SVG icons
function RecIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <polygon points="3,2 14,8 3,14" />
    </svg>
  );
}
