import { Show } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { formatDuration, formatDate } from "~/utils/time";

interface DiaryCardProps {
  entry: DiaryEntry;
  onClick: () => void;
}

export default function DiaryCard(props: DiaryCardProps) {
  return (
    <button
      class="flex flex-col rounded-lg border border-border-default bg-bg-secondary hover:border-accent-cyan/40 hover:bg-bg-elevated hover:shadow-[0_0_16px_-4px_rgba(0,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer text-left w-full"
      onClick={props.onClick}
    >
      {/* Thumbnail */}
      <div class="aspect-video bg-bg-primary flex items-center justify-center overflow-hidden">
        <Show
          when={props.entry.thumbnailDataUrl}
          fallback={
            <div class="text-text-secondary/30 font-mono text-xs">
              No preview
            </div>
          }
        >
          <img
            src={props.entry.thumbnailDataUrl!}
            alt={props.entry.title}
            class="w-full h-full object-cover"
          />
        </Show>
      </div>

      {/* Info */}
      <div class="p-3 flex flex-col gap-1.5">
        <h3 class="text-sm font-medium text-text-primary truncate">
          {props.entry.title}
        </h3>
        <div class="flex items-center gap-3 text-xs text-text-secondary font-mono">
          <span>{formatDate(props.entry.createdAt)}</span>
          <span>{formatDuration(props.entry.duration)}</span>
        </div>

        {/* Tags */}
        <Show when={props.entry.tags.length > 0}>
          <div class="flex flex-wrap gap-1 mt-1">
            {props.entry.tags.map((tag) => (
              <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-cyan/10 text-accent-cyan/70 border border-accent-cyan/20">
                {tag}
              </span>
            ))}
          </div>
        </Show>

        {/* Storage & cloud status */}
        <div class="flex items-center gap-2 mt-1">
          {/* Storage location badge */}
          <Show when={props.entry.storageProvider === "opfs"}>
            <span class="text-[10px] font-mono text-accent-cyan/60 border border-accent-cyan/20 rounded px-1 py-px">
              Local
            </span>
          </Show>
          <Show when={props.entry.storageProvider === "ephemeral"}>
            <span class="text-[10px] font-mono text-text-secondary/50 border border-border-default rounded px-1 py-px">
              In Memory
            </span>
          </Show>

          {/* Cloud status */}
          <Show when={props.entry.cloudStatus === "uploaded"}>
            <span class="text-[10px] font-mono text-accent-green">
              Synced
            </span>
          </Show>
          <Show when={props.entry.cloudStatus === "uploading"}>
            <span class="text-[10px] font-mono text-accent-amber animate-pulse">
              Syncing...
            </span>
          </Show>
          <Show when={props.entry.cloudStatus === "error"}>
            <span class="text-[10px] font-mono text-accent-red">
              Sync failed
            </span>
          </Show>
        </div>
      </div>
    </button>
  );
}
