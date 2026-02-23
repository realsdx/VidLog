import { Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { formatDuration, formatDate, formatTime } from "~/utils/time";
import { formatBlobSize, downloadBlob } from "~/utils/video";
import { storageManager } from "~/services/storage/manager";
import type { OPFSStorage } from "~/services/storage/opfs";
import Button from "~/components/ui/Button";
import { toastStore } from "~/stores/toast";

interface DiaryDetailProps {
  entry: DiaryEntry;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export default function DiaryDetail(props: DiaryDetailProps) {
  const [videoUrl, setVideoUrl] = createSignal<string | null>(null);
  const [videoBlob, setVideoBlob] = createSignal<Blob | null>(null);
  const [loadingVideo, setLoadingVideo] = createSignal(false);

  let dialogRef: HTMLDivElement | undefined;
  let closeBtnRef: HTMLButtonElement | undefined;

  // Capture the entry's own blob URL eagerly so we can compare during
  // cleanup without accessing the reactive props.entry getter (which may
  // already be null when the parent <Show> tears down this component).
  let entryOwnBlobUrl: string | undefined;

  // Load video blob — either from entry directly or lazy-load from OPFS
  // NOTE: createEffect must be synchronous. Read all reactive deps first,
  // then delegate async work to a plain IIFE to avoid breaking SolidJS
  // dependency tracking and cleanup semantics.
  createEffect(() => {
    // -- synchronous reactive reads (tracked by SolidJS) --
    const entry = props.entry;
    const blobUrl = entry.videoBlobUrl;
    const blob = entry.videoBlob;
    const provider = entry.storageProvider;
    const id = entry.id;

    // Cache the entry's own URL for safe comparison in onCleanup
    entryOwnBlobUrl = blobUrl;

    if (blobUrl) {
      // Already have a blob URL (ephemeral entries)
      setVideoUrl(blobUrl);
      setVideoBlob(blob);
      return;
    }

    // OPFS entries have videoBlob === null; lazy-load from OPFS
    if (provider === "opfs" && !blob) {
      setLoadingVideo(true);
      // H2: Cancellation flag — if effect re-runs or component unmounts,
      // stale async work won't update signals
      let cancelled = false;
      onCleanup(() => { cancelled = true; });

      // Async work in a non-returned IIFE — SolidJS won't see the Promise
      void (async () => {
        try {
          const opfs = storageManager.getProvider("opfs") as
            | OPFSStorage
            | undefined;
          if (opfs && "loadVideoBlob" in opfs) {
            const loaded = await opfs.loadVideoBlob(id);
            if (loaded && !cancelled) {
              const url = URL.createObjectURL(loaded);
              setVideoBlob(loaded);
              setVideoUrl(url);
            }
          }
        } catch (err) {
          console.warn("[DiaryDetail] Failed to load video from OPFS:", err);
        }
        if (!cancelled) {
          setLoadingVideo(false);
        }
      })();
    }
  });

  // Focus management: auto-focus close button on mount
  onMount(() => {
    closeBtnRef?.focus();
  });

  // Keyboard: Escape to close, trap focus within modal
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
      return;
    }
    // Focus trap
    if (e.key === "Tab" && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Cleanup: revoke blob URL created by lazy loading.
  // Uses the captured entryOwnBlobUrl instead of props.entry to avoid
  // accessing a potentially-null reactive getter during teardown.
  onCleanup(() => {
    const url = videoUrl();
    // Only revoke URLs we created (OPFS lazy-loaded), not the entry's own URL
    if (url && url !== entryOwnBlobUrl) {
      URL.revokeObjectURL(url);
    }
  });

  function handleDownload() {
    const blob = videoBlob();
    if (blob) {
      const safeName = props.entry.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      downloadBlob(blob, `${safeName}.webm`);
      toastStore.success("Download started");
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Diary entry: ${props.entry.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          props.onClose();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        class="bg-bg-secondary border border-border-default rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-scale-in"
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-border-default sticky top-0 bg-bg-secondary z-10">
          <h2 class="text-lg font-medium text-text-primary truncate pr-4">
            {props.entry.title}
          </h2>
          <button
            ref={closeBtnRef}
            class="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-2 -m-1 rounded-md hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:ring-offset-1 focus:ring-offset-bg-secondary"
            onClick={() => props.onClose()}
            type="button"
            aria-label="Close dialog"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        {/* Video */}
        <Show
          when={videoUrl()}
          fallback={
            <Show when={loadingVideo()}>
              <div class="bg-black flex items-center justify-center py-12">
                <p class="text-text-secondary font-mono text-sm animate-pulse" role="status">
                  Loading video...
                </p>
              </div>
            </Show>
          }
        >
          <div class="bg-black">
            <video
              src={videoUrl()!}
              controls
              class="w-full max-h-[50vh] object-contain"
              aria-label={`Video: ${props.entry.title}`}
            />
          </div>
        </Show>

        {/* Metadata */}
        <div class="p-4 flex flex-col gap-3">
          <div class="flex flex-wrap gap-4 text-sm text-text-secondary font-mono">
            <span>{formatDate(props.entry.createdAt)} at {formatTime(props.entry.createdAt)}</span>
            <span>Duration: {formatDuration(props.entry.duration)}</span>
            <Show when={videoBlob()}>
              <span>Size: {formatBlobSize(videoBlob()!.size)}</span>
            </Show>
          </div>

          {/* Storage badge */}
          <div class="flex items-center gap-2">
            <Show when={props.entry.storageProvider === "opfs"}>
              <span class="text-xs font-mono text-accent-cyan/60 border border-accent-cyan/20 rounded px-1.5 py-0.5">
                Local (OPFS)
              </span>
            </Show>
            <Show when={props.entry.storageProvider === "ephemeral"}>
              <span class="text-xs font-mono text-text-secondary/50 border border-border-default rounded px-1.5 py-0.5">
                In Memory
              </span>
            </Show>
          </div>

          <Show when={props.entry.tags.length > 0}>
            <div class="flex flex-wrap gap-1.5" role="list" aria-label="Tags">
              {props.entry.tags.map((tag) => (
                <span role="listitem" class="px-2 py-0.5 rounded text-xs font-mono bg-accent-cyan/10 text-accent-cyan/70 border border-accent-cyan/20">
                  {tag}
                </span>
              ))}
            </div>
          </Show>

          {/* Actions */}
          <div class="flex items-center gap-3 pt-2 border-t border-border-default mt-2">
            <Show when={videoBlob()}>
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
