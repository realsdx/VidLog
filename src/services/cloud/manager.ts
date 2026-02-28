import { createSignal } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import type {
  ICloudProvider,
  SyncQueueItem,
  SyncStatus,
  SyncProgress,
  UploadProgress,
  CloudSyncEntryStatus,
} from "./types";
import { entryToMeta } from "~/services/storage/types";
import { storageManager } from "~/services/storage/manager";

// ---------------------------------------------------------------------------
// Sync Queue Persistence (localStorage)
// ---------------------------------------------------------------------------

const QUEUE_STORAGE_KEY = "vidlog_cloud_sync_queue";

function loadQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SyncQueueItem[];
  } catch {
    // Corrupted data
  }
  return [];
}

function persistQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [provider, setProviderSignal] = createSignal<ICloudProvider | null>(null);
const [syncEnabled, setSyncEnabled] = createSignal(true);
const [syncQueue, setSyncQueue] = createSignal<SyncQueueItem[]>(loadQueue());
const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [syncProgress, setSyncProgress] = createSignal<SyncProgress | null>(null);
const [isProcessing, setIsProcessing] = createSignal(false);

/** Max retry attempts per entry before giving up */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 2000;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Update the sync queue signal and persist to localStorage.
 */
function updateQueue(updater: (prev: SyncQueueItem[]) => SyncQueueItem[]): void {
  setSyncQueue((prev) => {
    const next = updater(prev);
    persistQueue(next);
    return next;
  });
}

/**
 * Update an entry's cloudSync status in the diary store.
 * This updates both the in-memory signal and the persisted metadata.
 */
async function updateEntryCloudStatus(
  entryId: string,
  status: CloudSyncEntryStatus,
  extra?: Partial<DiaryEntry>,
): Promise<void> {
  // We need access to diaryStore but import it lazily to avoid circular deps
  const { diaryStore } = await import("~/stores/diary");
  const updates: Partial<DiaryEntry> = { ...extra };

  // Map CloudSyncEntryStatus to the existing cloudStatus field for backward compat
  if (status === "pending" || status === "uploading") {
    updates.cloudStatus = "uploading";
  } else if (status === "synced" || status === "cloud-only") {
    updates.cloudStatus = "uploaded";
  } else if (status === "failed") {
    updates.cloudStatus = "error";
  }

  await diaryStore.updateEntry(entryId, updates);
}

// ---------------------------------------------------------------------------
// Core Sync Operations
// ---------------------------------------------------------------------------

/**
 * Process the sync queue — upload pending entries one by one.
 */
async function processQueue(): Promise<void> {
  const cloudProvider = provider();
  if (!cloudProvider || !cloudProvider.isAuthenticated() || isProcessing()) return;

  const queue = syncQueue();
  if (queue.length === 0) {
    setSyncStatus("idle");
    return;
  }

  setIsProcessing(true);
  setSyncStatus("syncing");

  let processedCount = 0;
  const totalCount = queue.length;

  for (const item of [...queue]) {
    // Check if we should continue
    if (!syncEnabled() || !cloudProvider.isAuthenticated()) break;

    // Skip items that have exceeded max retries
    if (item.retryCount >= MAX_RETRIES) {
      await updateEntryCloudStatus(item.entryId, "failed", {
        cloudError: `Upload failed after ${MAX_RETRIES} attempts`,
      });
      updateQueue((q) => q.filter((i) => i.entryId !== item.entryId));
      continue;
    }

    // Exponential backoff check
    if (item.lastAttemptAt) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, item.retryCount);
      if (Date.now() - item.lastAttemptAt < delay) continue;
    }

    processedCount++;
    setSyncProgress({
      current: processedCount,
      total: totalCount,
      currentEntryId: item.entryId,
      uploadProgress: null,
    });

    try {
      // Load the full entry from storage
      const { diaryStore } = await import("~/stores/diary");
      const entry = diaryStore.entries().find((e) => e.id === item.entryId);
      if (!entry) {
        // Entry was deleted — remove from queue
        updateQueue((q) => q.filter((i) => i.entryId !== item.entryId));
        continue;
      }

      // Mark as uploading
      await updateEntryCloudStatus(item.entryId, "uploading");

      // Update attempt info
      updateQueue((q) =>
        q.map((i) =>
          i.entryId === item.entryId
            ? { ...i, lastAttemptAt: Date.now() }
            : i,
        ),
      );

      // Load the video blob if needed
      let blob = entry.videoBlob;
      if (!blob) {
        blob = await storageManager.loadVideoBlob(entry);
      }
      if (!blob) {
        throw new Error("Could not load video blob for upload");
      }

      // Upload video
      const videoFileRef = await cloudProvider.uploadVideo(
        entry.id,
        blob,
        entry.mimeType,
        (progress: UploadProgress) => {
          setSyncProgress((prev) =>
            prev ? { ...prev, uploadProgress: progress } : prev,
          );
        },
      );

      // Upload metadata
      const meta = entryToMeta(entry);
      const metaFileRef = await cloudProvider.uploadMeta(entry.id, meta);

      // Update entry with cloud sync info
      await updateEntryCloudStatus(item.entryId, "synced", {
        cloudProvider: cloudProvider.name,
        cloudFileId: videoFileRef.fileId,
        cloudError: null,
        cloudSync: {
          provider: cloudProvider.name,
          videoFileRef,
          metaFileRef,
          syncedAt: Date.now(),
          status: "synced",
        },
      });

      // Remove from queue
      updateQueue((q) => q.filter((i) => i.entryId !== item.entryId));
    } catch (err) {
      console.warn(`[CloudSync] Failed to upload entry ${item.entryId}:`, err);

      // Increment retry count
      updateQueue((q) =>
        q.map((i) =>
          i.entryId === item.entryId
            ? { ...i, retryCount: i.retryCount + 1, lastAttemptAt: Date.now() }
            : i,
        ),
      );

      const errorMsg = err instanceof Error ? err.message : "Upload failed";
      await updateEntryCloudStatus(item.entryId, "failed", {
        cloudError: errorMsg,
      });
    }
  }

  setIsProcessing(false);
  setSyncProgress(null);

  // Check if there are still items in queue
  const remaining = syncQueue();
  if (remaining.length > 0) {
    // Schedule another pass for retries
    setTimeout(() => void processQueue(), BASE_RETRY_DELAY);
    setSyncStatus("syncing");
  } else {
    setSyncStatus("idle");
  }
}

/**
 * Fetch all metadata from cloud and reconcile with local entries.
 * Creates "cloud-only" entries in OPFS for videos that exist in cloud
 * but not locally.
 */
async function fetchCloudEntries(): Promise<void> {
  const cloudProvider = provider();
  if (!cloudProvider || !cloudProvider.isAuthenticated()) return;

  try {
    const cloudEntries = await cloudProvider.downloadAllMeta();
    const { diaryStore } = await import("~/stores/diary");
    const localEntries = diaryStore.entries();
    const localIds = new Set(localEntries.map((e) => e.id));

    for (const { meta, metaFileRef, videoFileRef } of cloudEntries) {
      if (localIds.has(meta.id)) {
        // Entry exists locally — update cloud sync info if missing
        const localEntry = localEntries.find((e) => e.id === meta.id);
        if (localEntry && !localEntry.cloudSync && videoFileRef) {
          await diaryStore.updateEntry(meta.id, {
            cloudStatus: "uploaded",
            cloudProvider: cloudProvider.name,
            cloudFileId: videoFileRef.fileId,
            cloudSync: {
              provider: cloudProvider.name,
              videoFileRef,
              metaFileRef,
              syncedAt: Date.now(),
              status: "synced",
            },
          });
        }
        continue;
      }

      // Cloud-only entry — create local metadata entry without video blob
      if (!videoFileRef) continue;

      const cloudOnlyEntry: DiaryEntry = {
        ...meta,
        videoBlob: null,
        videoBlobUrl: null,
        storageProvider: "opfs",
        cloudStatus: "uploaded",
        cloudProvider: cloudProvider.name,
        cloudFileId: videoFileRef.fileId,
        cloudUrl: null,
        cloudError: null,
        cloudSync: {
          provider: cloudProvider.name,
          videoFileRef,
          metaFileRef,
          syncedAt: Date.now(),
          status: "cloud-only",
        },
      };

      // Save the metadata-only entry to OPFS so it appears in the library
      // We save via storageManager (which writes to OPFS) — the entry has
      // videoBlob: null so only the JSON metadata gets written, no video file.
      try {
        await storageManager.save(cloudOnlyEntry);
      } catch (err) {
        console.warn(`[CloudSync] Failed to save cloud-only entry ${meta.id}:`, err);
      }
    }

    // Reload entries to reflect changes
    await diaryStore.loadEntries();
  } catch (err) {
    console.warn("[CloudSync] Failed to fetch cloud entries:", err);
  }
}

/**
 * Upload a single entry to cloud (for ephemeral one-shot uploads).
 * Does not add to queue or affect local storage state.
 */
async function uploadSingle(
  entry: DiaryEntry,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  const cloudProvider = provider();
  if (!cloudProvider || !cloudProvider.isAuthenticated()) {
    throw new Error("Not connected to cloud");
  }

  const blob = entry.videoBlob;
  if (!blob) {
    throw new Error("No video blob to upload");
  }

  // Upload video
  const videoFileRef = await cloudProvider.uploadVideo(
    entry.id,
    blob,
    entry.mimeType,
    onProgress,
  );

  // Upload metadata
  const meta = entryToMeta(entry);
  await cloudProvider.uploadMeta(entry.id, meta);

  // Update entry cloud status (for ephemeral entries this is just in-memory)
  const { diaryStore } = await import("~/stores/diary");
  await diaryStore.updateEntry(entry.id, {
    cloudStatus: "uploaded",
    cloudProvider: cloudProvider.name,
    cloudFileId: videoFileRef.fileId,
    cloudError: null,
  });
}

// ---------------------------------------------------------------------------
// Exported Singleton
// ---------------------------------------------------------------------------

export const cloudSyncManager = {
  // Signals (read-only accessors)
  provider,
  syncEnabled,
  syncQueue,
  syncStatus,
  syncProgress,
  isProcessing,

  /**
   * Set the cloud provider implementation.
   * Called during app init after provider auth is restored.
   */
  setProvider(p: ICloudProvider): void {
    setProviderSignal(p);
  },

  /**
   * Clear the cloud provider (on disconnect).
   */
  clearProvider(): void {
    setProviderSignal(null);
    setSyncStatus("idle");
    setSyncProgress(null);
  },

  /** Enable auto-sync. */
  enable(): void {
    setSyncEnabled(true);
    void processQueue();
  },

  /** Disable auto-sync. Stops queue processing after the current item. */
  disable(): void {
    setSyncEnabled(false);
  },

  /**
   * Add an entry to the upload queue.
   * Called automatically after saving to OPFS when cloud sync is enabled.
   */
  queueUpload(entryId: string): void {
    // Don't add duplicates
    if (syncQueue().some((i) => i.entryId === entryId)) return;

    updateQueue((q) => [
      ...q,
      {
        entryId,
        queuedAt: Date.now(),
        retryCount: 0,
        lastAttemptAt: null,
      },
    ]);

    // Start processing if enabled
    if (syncEnabled() && provider()?.isAuthenticated()) {
      void processQueue();
    }
  },

  /**
   * Remove an entry from the upload queue (e.g. when entry is deleted).
   */
  dequeueUpload(entryId: string): void {
    updateQueue((q) => q.filter((i) => i.entryId !== entryId));
  },

  /** Process pending uploads. */
  processQueue,

  /** Fetch cloud entries and reconcile with local state. */
  fetchCloudEntries,

  /** Upload a single entry (for ephemeral one-shot uploads). */
  uploadSingle,

  /**
   * Full sync cycle: upload pending locals + fetch cloud-only entries.
   */
  async syncNow(): Promise<void> {
    if (!provider()?.isAuthenticated()) return;

    setSyncStatus("syncing");
    try {
      await processQueue();
      await fetchCloudEntries();
    } catch (err) {
      console.warn("[CloudSync] syncNow failed:", err);
      setSyncStatus("error");
    }
  },
};
