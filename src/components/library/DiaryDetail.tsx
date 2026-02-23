import { Show } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { formatDuration, formatDate, formatTime } from "~/utils/time";
import { formatBlobSize, downloadBlob } from "~/utils/video";
import Button from "~/components/ui/Button";

interface DiaryDetailProps {
  entry: DiaryEntry;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export default function DiaryDetail(props: DiaryDetailProps) {
  function handleDownload() {
    if (props.entry.videoBlob) {
      const safeName = props.entry.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      downloadBlob(props.entry.videoBlob, `${safeName}.webm`);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div class="bg-bg-secondary border border-border-default rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-border-default">
          <h2 class="text-lg font-medium text-text-primary truncate pr-4">
            {props.entry.title}
          </h2>
          <button
            class="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1"
            onClick={props.onClose}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        {/* Video */}
        <Show when={props.entry.videoBlobUrl}>
          <div class="bg-black">
            <video
              src={props.entry.videoBlobUrl!}
              controls
              class="w-full max-h-[50vh] object-contain"
            />
          </div>
        </Show>

        {/* Metadata */}
        <div class="p-4 flex flex-col gap-3">
          <div class="flex flex-wrap gap-4 text-sm text-text-secondary font-mono">
            <span>{formatDate(props.entry.createdAt)} at {formatTime(props.entry.createdAt)}</span>
            <span>Duration: {formatDuration(props.entry.duration)}</span>
            <Show when={props.entry.videoBlob}>
              <span>Size: {formatBlobSize(props.entry.videoBlob!.size)}</span>
            </Show>
          </div>

          <Show when={props.entry.tags.length > 0}>
            <div class="flex flex-wrap gap-1.5">
              {props.entry.tags.map((tag) => (
                <span class="px-2 py-0.5 rounded text-xs font-mono bg-accent-cyan/10 text-accent-cyan/70 border border-accent-cyan/20">
                  {tag}
                </span>
              ))}
            </div>
          </Show>

          {/* Actions */}
          <div class="flex items-center gap-3 pt-2 border-t border-border-default mt-2">
            <Show when={props.entry.videoBlob}>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                Download
              </Button>
            </Show>
            <Button
              variant="danger"
              size="sm"
              onClick={() => props.onDelete(props.entry.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
