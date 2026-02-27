import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider, StorageCapabilities, ChangeSummary } from "./types";
import { deserializeMeta, entryToMeta } from "./types";
import { getExtensionForMimeType } from "~/utils/format";

/**
 * Filesystem Storage Provider — persists diary entries to a user-visible OS folder
 * via the File System Access API.
 *
 * Directory layout (inside user-chosen folder):
 *   entries/{id}.json          — serialized DiaryEntryMeta
 *   videos/{id}.{mp4|webm}    — video blob (extension derived from mimeType)
 *
 * IDs use date-prefixed format (e.g. 2026-02-23_143207_a3f7) for human-readable
 * filenames, structurally different from UUIDs to prevent cross-provider collision.
 *
 * Thumbnails are stored inline as base64 data URLs in the metadata JSON.
 * Video blobs are lazy-loaded (null on getAll(), populated via loadVideoBlob()).
 *
 * Uses atomic swap files via createWritable() — crash before .close() = no corruption.
 */
export class FilesystemStorage implements IStorageProvider {
  readonly name = "filesystem";
  readonly capabilities: StorageCapabilities = {
    persistent: true,
    lazyBlobs: true,
    quota: false, // No reliable quota API for user-visible filesystem
    requiresPermission: true,
    userVisibleFiles: true,
  };

  private root: FileSystemDirectoryHandle;
  private entriesDir!: FileSystemDirectoryHandle;
  private videosDir!: FileSystemDirectoryHandle;

  // --- FileSystemObserver state ---
  private observer: FileSystemObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Known entry IDs — used to diff against disk after observer fires. */
  private knownEntryIds: Set<string> = new Set();
  /**
   * Self-suppression: IDs of entries currently being written/deleted by the app.
   * Entries stay in this set for ~2s after I/O completes, covering the debounce
   * window. Prevents the app's own writes from triggering "external change" toasts.
   */
  private pendingOwnWrites: Set<string> = new Set();

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
  }

  /** Create entries/ and videos/ subdirectories if they don't exist. */
  async init(): Promise<void> {
    this.entriesDir = await this.root.getDirectoryHandle("entries", {
      create: true,
    });
    this.videosDir = await this.root.getDirectoryHandle("videos", {
      create: true,
    });
  }

  private assertInitialized(): void {
    if (!this.entriesDir || !this.videosDir) {
      throw new Error("FilesystemStorage not initialized. Call init() first.");
    }
  }

  async save(entry: DiaryEntry): Promise<void> {
    this.assertInitialized();
    this.pendingOwnWrites.add(entry.id);

    try {
      // Write video blob first (so we don't create orphan metadata if this fails)
      if (entry.videoBlob) {
        const ext = getExtensionForMimeType(entry.mimeType);
        const videoFile = await this.videosDir.getFileHandle(
          `${entry.id}${ext}`,
          { create: true },
        );
        const writable = await videoFile.createWritable();
        await writable.write(entry.videoBlob);
        await writable.close();
      }

      // Write metadata JSON last (after video blob succeeds)
      const meta = entryToMeta(entry);
      const metaFile = await this.entriesDir.getFileHandle(
        `${entry.id}.json`,
        { create: true },
      );
      const writable = await metaFile.createWritable();
      await writable.write(JSON.stringify(meta, null, 2));
      await writable.close();

      // Keep observer's known set in sync with our own writes
      this.knownEntryIds.add(entry.id);
    } catch (err) {
      // Re-throw with a friendlier message for common cases
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error(
          "Permission to write to the folder was denied. Please re-grant access in Settings.",
        );
      }
      throw err;
    } finally {
      setTimeout(() => this.pendingOwnWrites.delete(entry.id), 2000);
    }
  }

  async get(id: string): Promise<DiaryEntry | null> {
    this.assertInitialized();
    try {
      const metaFile = await this.entriesDir.getFileHandle(`${id}.json`);
      const file = await metaFile.getFile();
      const text = await file.text();
      return deserializeMeta(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async getAll(): Promise<DiaryEntry[]> {
    this.assertInitialized();
    const entries: DiaryEntry[] = [];

    for await (const [name, handle] of this.entriesDir.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".json")) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const text = await file.text();
        entries.push(deserializeMeta(JSON.parse(text)));
      } catch {
        // Skip corrupt entries
        console.warn(`[Filesystem] Skipping corrupt entry file: ${name}`);
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async update(entry: DiaryEntry, updates: Partial<DiaryEntry>): Promise<void> {
    this.assertInitialized();
    this.pendingOwnWrites.add(entry.id);
    const existing = await this.get(entry.id);
    if (!existing) return;

    try {
      const updated = { ...existing, ...updates };

      // If video blob is being updated, write it
      if (updates.videoBlob) {
        const ext = getExtensionForMimeType(updated.mimeType);
        const videoFile = await this.videosDir.getFileHandle(`${entry.id}${ext}`, {
          create: true,
        });
        const writable = await videoFile.createWritable();
        await writable.write(updates.videoBlob);
        await writable.close();
      }

      // Write updated metadata
      const meta = entryToMeta(updated);
      const metaFile = await this.entriesDir.getFileHandle(`${entry.id}.json`, {
        create: true,
      });
      const writable = await metaFile.createWritable();
      await writable.write(JSON.stringify(meta, null, 2));
      await writable.close();
    } finally {
      setTimeout(() => this.pendingOwnWrites.delete(entry.id), 2000);
    }
  }

  async delete(entry: DiaryEntry): Promise<void> {
    this.assertInitialized();
    this.pendingOwnWrites.add(entry.id);

    // Revoke blob URL if somehow still in memory
    if (entry.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }

    try {
      // Remove files — ignore errors if they don't exist
      try {
        await this.entriesDir.removeEntry(`${entry.id}.json`);
      } catch {
        // Already deleted or doesn't exist
      }
      try {
        const ext = getExtensionForMimeType(entry.mimeType);
        await this.videosDir.removeEntry(`${entry.id}${ext}`);
      } catch {
        // Already deleted or doesn't exist
      }

      // Keep observer's known set in sync with our own writes
      this.knownEntryIds.delete(entry.id);
    } finally {
      setTimeout(() => this.pendingOwnWrites.delete(entry.id), 2000);
    }
  }

  /**
   * Lazy-load a video blob for a specific entry.
   * Returns the Blob, or null if the video file doesn't exist.
   */
  async loadVideoBlob(entry: DiaryEntry): Promise<Blob | null> {
    this.assertInitialized();
    try {
      const ext = getExtensionForMimeType(entry.mimeType);
      const videoFile = await this.videosDir.getFileHandle(`${entry.id}${ext}`);
      const file = await videoFile.getFile();
      return file;
    } catch {
      return null;
    }
  }

  /**
   * Scan for orphan video files (videos without matching metadata JSON)
   * and remove them. Returns count of orphans cleaned up.
   */
  async cleanup(): Promise<{ orphansRemoved: number }> {
    this.assertInitialized();

    // Collect all entry IDs (from JSON filenames)
    const entryIds = new Set<string>();
    for await (const [name, handle] of this.entriesDir.entries()) {
      if (handle.kind === "file" && name.endsWith(".json")) {
        entryIds.add(name.replace(/\.json$/, ""));
      }
    }

    // Find video files without matching entry (supports both .webm and .mp4)
    const videoExtensions = [".webm", ".mp4"];
    let orphansRemoved = 0;
    for await (const [name, handle] of this.videosDir.entries()) {
      if (handle.kind !== "file") continue;
      const ext = videoExtensions.find((e) => name.endsWith(e));
      if (!ext) continue;
      const id = name.slice(0, -ext.length);
      if (!entryIds.has(id)) {
        try {
          await this.videosDir.removeEntry(name);
          orphansRemoved++;
          console.info(`[Filesystem] Removed orphan video: ${name}`);
        } catch {
          console.warn(`[Filesystem] Failed to remove orphan: ${name}`);
        }
      }
    }

    return { orphansRemoved };
  }

  // ---------------------------------------------------------------------------
  // FileSystemObserver — watch entries/ for external changes
  // ---------------------------------------------------------------------------

  /**
   * Start observing the entries directory for external file changes.
   * Uses the experimental FileSystemObserver API (Chrome flag) when available.
   * Falls back to a no-op when the API isn't present — zero impact.
   *
   * Self-suppression: the app's own writes add entry IDs to pendingOwnWrites
   * before I/O and remove them ~2s after completion. The "modified" fallback
   * in handleExternalChange() is suppressed while any own writes are pending.
   * External changes are debounced at 1 second to let batch operations settle.
   */
  startObserving(onChange: (summary: ChangeSummary) => void): void {
    // Feature-detect — bail silently if unavailable
    if (!("FileSystemObserver" in self)) {
      console.info("[Filesystem] FileSystemObserver not available — skipping");
      return;
    }

    // Snapshot current entry IDs so we can diff later
    this.refreshKnownIds();

    this.observer = new FileSystemObserver(() => {
      // Debounce: wait 1s after the last event before reacting.
      // Self-suppression happens in handleExternalChange() via pendingOwnWrites.
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        void this.handleExternalChange(onChange);
      }, 1000);
    });

    // Observe the entries directory recursively
    void this.observer.observe(this.entriesDir, { recursive: true }).then(
      () => console.info("[Filesystem] Observing entries/ for external changes"),
      (err) => console.warn("[Filesystem] Failed to observe entries/:", err),
    );
  }

  /** Stop observing and clean up timers. */
  stopObserving(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /** Clean up all resources including the observer. */
  async dispose(): Promise<void> {
    this.stopObserving();
  }

  /**
   * Re-read entries/ from disk, diff against knownEntryIds, and call
   * the onChange callback with a summary of what changed externally.
   */
  private async handleExternalChange(
    onChange: (summary: ChangeSummary) => void,
  ): Promise<void> {
    try {
      const currentIds = await this.scanEntryIds();

      let added = 0;
      let removed = 0;
      // modified is hard to detect without content hashing — we count
      // "modified" as entries that exist in both sets (observer told us
      // something changed, so if the ID set is the same, something was edited).
      let modified = 0;

      // New IDs not in our known set
      for (const id of currentIds) {
        if (!this.knownEntryIds.has(id)) added++;
      }

      // IDs we knew about that are now gone
      for (const id of this.knownEntryIds) {
        if (!currentIds.has(id)) removed++;
      }

      // If nothing was added or removed but the observer still fired,
      // something was modified in place — but only report this when the app
      // has no pending writes (otherwise it's our own save/update triggering it)
      if (added === 0 && removed === 0 && this.pendingOwnWrites.size === 0) {
        modified = 1; // We can't know exactly how many without hashing
      }

      // Update known set to the new state
      this.knownEntryIds = currentIds;

      const summary: ChangeSummary = { added, removed, modified };

      // Only notify if something actually changed
      if (added > 0 || removed > 0 || modified > 0) {
        onChange(summary);
      }
    } catch (err) {
      console.warn("[Filesystem] Failed to process external change:", err);
    }
  }

  /** Scan entries/ directory and return a set of entry IDs (filenames without .json). */
  private async scanEntryIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for await (const [name, handle] of this.entriesDir.entries()) {
      if (handle.kind === "file" && name.endsWith(".json")) {
        ids.add(name.replace(/\.json$/, ""));
      }
    }
    return ids;
  }

  /** Snapshot current entry IDs from disk into knownEntryIds. */
  private refreshKnownIds(): void {
    void this.scanEntryIds().then((ids) => {
      this.knownEntryIds = ids;
    });
  }

  /** Get the root directory handle (for display in Settings). */
  getRootHandle(): FileSystemDirectoryHandle {
    return this.root;
  }
}

/** Check if the File System Access API is available */
export function isFilesystemAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
