import { Show } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { formatDuration, formatDate } from "~/utils/time";
import StorageBadge from "~/components/ui/StorageBadge";

interface DiaryCardProps {
  entry: DiaryEntry;
  onClick: () => void;
}

export default function DiaryCard(props: DiaryCardProps) {
  return (
    <button
      class="flex flex-col rounded-lg border border-border-default bg-bg-secondary active:bg-bg-elevated card-hover transition-all duration-200 overflow-hidden cursor-pointer text-left w-full"
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
              <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-cyan/10 text-accent-cyan/70 border border-accent-cyan/20 max-w-[120px] truncate">
                {tag}
              </span>
            ))}
          </div>
        </Show>

        {/* Storage & cloud status */}
        <div class="flex items-center gap-2 mt-1">
          {/* Storage location badge */}
          <StorageBadge provider={props.entry.storageProvider} compact />

          {/* Cloud sync status badges */}
          <Show when={props.entry.cloudSync?.status === "synced"}>
            <span class="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-green" title="Synced to cloud">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 13a3.5 3.5 0 0 1-.654-6.938A4.5 4.5 0 0 1 12.5 5.5h.5a3 3 0 0 1 0 6H13" />
                <path d="M4.5 13h8" stroke="currentColor" stroke-width="1.5" fill="none" />
              </svg>
              Synced
            </span>
          </Show>
          <Show when={props.entry.cloudSync?.status === "cloud-only"}>
            <span class="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-cyan/80" title="Stored in cloud only">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 13a3.5 3.5 0 0 1-.654-6.938A4.5 4.5 0 0 1 12.5 5.5h.5a3 3 0 0 1 0 6H13" />
                <path d="M4.5 13h8" stroke="currentColor" stroke-width="1.5" fill="none" />
              </svg>
              Cloud
            </span>
          </Show>
          <Show when={props.entry.cloudSync?.status === "pending" || props.entry.cloudSync?.status === "uploading"}>
            <span class="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-amber animate-pulse" title="Uploading to cloud">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 13a3.5 3.5 0 0 1-.654-6.938A4.5 4.5 0 0 1 12.5 5.5h.5a3 3 0 0 1 0 6H13" />
                <path d="M8 13V8m-2.5 2.5L8 8l2.5 2.5" stroke="currentColor" stroke-width="1.5" fill="none" />
              </svg>
              Syncing...
            </span>
          </Show>
          <Show when={props.entry.cloudSync?.status === "failed"}>
            <span class="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-red" title="Cloud sync failed">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 13a3.5 3.5 0 0 1-.654-6.938A4.5 4.5 0 0 1 12.5 5.5h.5a3 3 0 0 1 0 6H13" />
              </svg>
              Failed
            </span>
          </Show>

          {/* Legacy cloud status (backward compat) — shown only if no cloudSync */}
          <Show when={!props.entry.cloudSync}>
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
          </Show>
        </div>
      </div>
    </button>
  );
}
