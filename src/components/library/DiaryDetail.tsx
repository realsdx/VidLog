import { Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { formatDuration, formatDate, formatTime } from "~/utils/time";
import { downloadBlob } from "~/utils/video";
import { formatBytes, getExtensionForMimeType } from "~/utils/format";
import { storageManager } from "~/services/storage/manager";
import { cloudSyncManager } from "~/services/cloud/manager";
import { cloudStore } from "~/stores/cloud";
import { GoogleDriveProvider } from "~/services/cloud/google-drive";
import Button from "~/components/ui/Button";
import StorageBadge from "~/components/ui/StorageBadge";
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
  const [isCloudOnly, setIsCloudOnly] = createSignal(false);
  const [isOffline, setIsOffline] = createSignal(!navigator.onLine);
  const [reconnecting, setReconnecting] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);

  let dialogRef: HTMLDivElement | undefined;
  let closeBtnRef: HTMLButtonElement | undefined;

  // Capture the entry's own blob URL eagerly so we can compare during
  // cleanup without accessing the reactive props.entry getter (which may
  // already be null when the parent <Show> tears down this component).
  let entryOwnBlobUrl: string | undefined;

  // Track online/offline status
  function handleOnline() { setIsOffline(false); }
  function handleOffline() { setIsOffline(true); }

  onMount(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onCleanup(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  });

  // Load video blob — either from entry directly, lazy-load from OPFS,
  // or stream from cloud for cloud-only entries.
  createEffect(() => {
    // -- synchronous reactive reads (tracked by SolidJS) --
    const entry = props.entry;
    const blobUrl = entry.videoBlobUrl;
    const blob = entry.videoBlob;

    // Cache the entry's own URL for safe comparison in onCleanup
    entryOwnBlobUrl = blobUrl ?? undefined;

    // Check if this is a cloud-only entry
    const cloudOnly = entry.cloudSync?.status === "cloud-only";
    setIsCloudOnly(cloudOnly);

    if (blobUrl) {
      // Already have a blob URL (ephemeral entries)
      setVideoUrl(blobUrl);
      setVideoBlob(blob);
      return;
    }

    if (cloudOnly) {
      // Cloud-only entry — stream from cloud provider
      if (isOffline()) {
        // Offline — can't stream
        setVideoUrl(null);
        return;
      }

      setLoadingVideo(true);
      let cancelled = false;
      onCleanup(() => { cancelled = true; });

      void (async () => {
        try {
          const cloudProvider = cloudSyncManager.provider();
          if (cloudProvider && entry.cloudSync?.videoFileRef) {
            const streamUrl = await cloudProvider.getVideoStreamUrl(
              entry.cloudSync.videoFileRef,
            );
            if (!cancelled) {
              setVideoUrl(streamUrl);
            }
          }
        } catch (err) {
          console.warn("[DiaryDetail] Failed to get cloud stream URL:", err);
          if (!cancelled) {
            toastStore.error("Failed to load video from cloud");
          }
        }
        if (!cancelled) {
          setLoadingVideo(false);
        }
      })();
      return;
    }

    // Lazy-load video blob for providers with lazy loading capability
    if (!blob) {
      const provider = storageManager.getProviderForEntry(entry);
      if (provider.capabilities.lazyBlobs) {
        setLoadingVideo(true);
        let cancelled = false;
        onCleanup(() => { cancelled = true; });

        void (async () => {
          try {
            const loaded = await storageManager.loadVideoBlob(entry);
            if (loaded && !cancelled) {
              const url = URL.createObjectURL(loaded);
              setVideoBlob(loaded);
              setVideoUrl(url);
            }
          } catch (err) {
            console.warn("[DiaryDetail] Failed to load video:", err);
          }
          if (!cancelled) {
            setLoadingVideo(false);
          }
        })();
      }
    }
  });

  // Focus management: auto-focus close button on mount
  // Also lock body scroll to prevent background scrolling on mobile
  onMount(() => {
    closeBtnRef?.focus();
    document.body.style.overflow = "hidden";
  });

  // Cleanup: restore body scroll when modal unmounts
  onCleanup(() => {
    document.body.style.overflow = "";
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
      downloadBlob(blob, `${safeName}${getExtensionForMimeType(props.entry.mimeType)}`);
      toastStore.success("Download started");
    }
  }

  async function handleReconnect() {
    setReconnecting(true);
    try {
      const provider = new GoogleDriveProvider();
      await cloudStore.connect(provider);
      // After reconnecting, re-trigger the video load by re-entering the effect.
      // The effect tracks props.entry which hasn't changed, so we manually
      // attempt to load the stream URL here.
      const cp = cloudSyncManager.provider();
      if (cp && props.entry.cloudSync?.videoFileRef) {
        setLoadingVideo(true);
        const streamUrl = await cp.getVideoStreamUrl(props.entry.cloudSync.videoFileRef);
        setVideoUrl(streamUrl);
        setLoadingVideo(false);
      }
    } catch (err) {
      console.warn("[DiaryDetail] Reconnect failed:", err);
    } finally {
      setReconnecting(false);
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
        class="bg-bg-secondary border border-border-default rounded-lg max-w-3xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain animate-scale-in"
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-border-default sticky top-0 bg-bg-secondary z-10">
          <h2 class="text-lg font-medium text-text-primary truncate pr-4">
            {props.entry.title}
          </h2>
          <button
            ref={closeBtnRef}
            class="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-3 -m-2 rounded-md hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:ring-offset-1 focus:ring-offset-bg-secondary"
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
            <>
              {/* Cloud-only + offline: unavailable message */}
              <Show when={isCloudOnly() && isOffline()}>
                <div class="bg-black flex flex-col items-center justify-center py-16 gap-3">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-secondary/50">
                    <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                  </svg>
                  <p class="text-text-secondary font-mono text-sm">Unavailable offline</p>
                  <p class="text-text-secondary/60 font-mono text-xs">This video is stored in the cloud and requires an internet connection to play</p>
                </div>
              </Show>

              {/* Cloud-only + online but still loading */}
              <Show when={isCloudOnly() && !isOffline() && loadingVideo()}>
                <div class="bg-black flex items-center justify-center py-12">
                  <p class="text-accent-cyan/70 font-mono text-sm animate-pulse" role="status">
                    Connecting to cloud...
                  </p>
                </div>
              </Show>

              {/* Cloud-only + online + not loading + no URL = failed to get stream */}
              <Show when={isCloudOnly() && !isOffline() && !loadingVideo()}>
                <div class="bg-black flex flex-col items-center justify-center py-16 gap-3">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-accent-red/60">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <p class="text-text-secondary font-mono text-sm">Could not load cloud video</p>
                  <p class="text-text-secondary/60 font-mono text-xs">Your Google Drive session has expired</p>
                  <button
                    class="mt-2 px-4 py-2 rounded-md text-sm font-mono font-medium text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleReconnect}
                    disabled={reconnecting()}
                    type="button"
                  >
                    {reconnecting() ? "Reconnecting..." : "Reconnect to Google Drive"}
                  </button>
                </div>
              </Show>

              {/* Local entry loading */}
              <Show when={!isCloudOnly() && loadingVideo()}>
                <div class="bg-black flex items-center justify-center py-12">
                  <p class="text-text-secondary font-mono text-sm animate-pulse" role="status">
                    Loading video...
                  </p>
                </div>
              </Show>
            </>
          }
        >
          <div class="bg-black relative">
            <video
              src={videoUrl()!}
              controls
              class="w-full max-h-[50dvh] object-contain"
              aria-label={`Video: ${props.entry.title}`}
            />
            {/* Cloud streaming indicator */}
            <Show when={isCloudOnly()}>
              <div class="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 rounded px-2 py-1 text-xs font-mono text-accent-cyan/80 backdrop-blur-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
                </svg>
                Streaming from cloud
              </div>
            </Show>
          </div>
        </Show>

        {/* Metadata */}
        <div class="p-4 flex flex-col gap-3">
          <div class="flex flex-wrap gap-4 text-sm text-text-secondary font-mono">
            <span>{formatDate(props.entry.createdAt)} at {formatTime(props.entry.createdAt)}</span>
            <span>Duration: {formatDuration(props.entry.duration)}</span>
            <Show when={videoBlob()}>
              <span>Size: {formatBytes(videoBlob()!.size)}</span>
            </Show>
          </div>

          {/* Storage badge + cloud sync status */}
          <div class="flex items-center gap-2 flex-wrap">
            <StorageBadge provider={props.entry.storageProvider} />
            <Show when={props.entry.cloudSync}>
              {(cloudSync) => (
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border"
                  classList={{
                    "bg-accent-cyan/10 text-accent-cyan/70 border-accent-cyan/20":
                      cloudSync().status === "synced",
                    "bg-accent-amber/10 text-accent-amber/70 border-accent-amber/20":
                      cloudSync().status === "cloud-only",
                    "bg-accent-red/10 text-accent-red/70 border-accent-red/20":
                      cloudSync().status === "failed",
                    "bg-text-secondary/10 text-text-secondary/70 border-text-secondary/20":
                      cloudSync().status === "uploading" || cloudSync().status === "pending",
                  }}
                >
                  <Show when={cloudSync().status === "synced"}>Synced to cloud</Show>
                  <Show when={cloudSync().status === "cloud-only"}>Cloud only</Show>
                  <Show when={cloudSync().status === "uploading"}>Uploading...</Show>
                  <Show when={cloudSync().status === "pending"}>Pending upload</Show>
                  <Show when={cloudSync().status === "failed"}>Sync failed</Show>
                </span>
              )}
            </Show>
          </div>

          <Show when={props.entry.tags.length > 0}>
            <div class="flex flex-wrap gap-1.5" role="list" aria-label="Tags">
              {props.entry.tags.map((tag) => (
                <span role="listitem" class="px-2 py-0.5 rounded text-xs font-mono bg-accent-cyan/10 text-accent-cyan/70 border border-accent-cyan/20 max-w-[200px] truncate">
                  {tag}
                </span>
              ))}
            </div>
          </Show>

          {/* Actions */}
          <div class="flex flex-col gap-3 pt-2 border-t border-border-default mt-2">
            <div class="flex items-center gap-3">
              <Show when={videoBlob()}>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  Download
                </Button>
              </Show>
              <Show when={isCloudOnly() && !videoBlob()}>
                <span class="text-xs font-mono text-text-secondary/50">
                  Download not available for cloud-only entries
                </span>
              </Show>
              <Show when={!showDeleteConfirm()}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete
                </Button>
              </Show>
            </div>

            {/* Inline delete confirmation */}
            <Show when={showDeleteConfirm()}>
              <div class="flex flex-col gap-3 p-3 rounded-md border border-accent-red/30 bg-accent-red/5">
                <div class="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="text-accent-red shrink-0 mt-0.5"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                  <div class="flex flex-col gap-1">
                    <span class="text-xs font-mono text-accent-red font-bold">
                      Delete this entry?
                    </span>
                    <span class="text-xs font-mono text-text-secondary/60">
                      <Show
                        when={
                          props.entry.cloudSync?.videoFileRef ||
                          props.entry.cloudSync?.metaFileRef
                        }
                        fallback="This action cannot be undone."
                      >
                        This will also delete the cloud copy from Google Drive. This action cannot be undone.
                      </Show>
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    class="px-3 py-1.5 rounded text-xs font-mono font-medium text-text-secondary hover:text-text-primary bg-bg-elevated hover:bg-bg-elevated/80 border border-border-default transition-colors cursor-pointer"
                    onClick={() => setShowDeleteConfirm(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    class="px-3 py-1.5 rounded text-xs font-mono font-medium text-white bg-accent-red hover:bg-accent-red/80 transition-colors cursor-pointer"
                    onClick={() => props.onDelete(props.entry.id)}
                    type="button"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
