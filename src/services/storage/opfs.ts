import type { DiaryEntry, DiaryEntryMeta } from "~/models/types";
import type { IStorageProvider } from "./types";

/**
 * Convert a DiaryEntry to its serializable metadata subset.
 * Strips Blob and object URL fields that can't be JSON-serialized.
 */
function entryToMeta(entry: DiaryEntry): DiaryEntryMeta {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    duration: entry.duration,
    tags: entry.tags,
    templateId: entry.templateId,
    storageProvider: entry.storageProvider,
    thumbnailDataUrl: entry.thumbnailDataUrl,
    cloudStatus: entry.cloudStatus,
    cloudProvider: entry.cloudProvider,
    cloudFileId: entry.cloudFileId,
    cloudUrl: entry.cloudUrl,
    cloudError: entry.cloudError,
  };
}

/**
 * Reconstruct a DiaryEntry from stored metadata.
 * Video blob and blob URL are null — loaded lazily on demand.
 */
function metaToEntry(meta: DiaryEntryMeta): DiaryEntry {
  return {
    ...meta,
    videoBlob: null,
    videoBlobUrl: null,
  };
}

/**
 * OPFS Storage Provider — persists diary entries to the Origin Private File System.
 *
 * Directory layout:
 *   /videodiary/
 *     entries/{id}.json   — serialized DiaryEntryMeta
 *     videos/{id}.webm    — video blob
 *
 * Thumbnails are stored inline as base64 data URLs in the metadata JSON
 * to avoid extra file I/O for the common "load library grid" path.
 *
 * Video blobs are lazy-loaded: null on initial getAll(), populated
 * only when loadVideoBlob() is called (e.g. when user opens an entry).
 */
export class OPFSStorage implements IStorageProvider {
  readonly name = "opfs";

  private root: FileSystemDirectoryHandle | null = null;
  private entriesDir: FileSystemDirectoryHandle | null = null;
  private videosDir: FileSystemDirectoryHandle | null = null;

  /** Initialize OPFS directory structure. Must be called before any other method. */
  async init(): Promise<void> {
    const opfsRoot = await navigator.storage.getDirectory();
    this.root = await opfsRoot.getDirectoryHandle("videodiary", {
      create: true,
    });
    this.entriesDir = await this.root.getDirectoryHandle("entries", {
      create: true,
    });
    this.videosDir = await this.root.getDirectoryHandle("videos", {
      create: true,
    });

    // Request persistent storage so the browser won't evict OPFS data
    // under storage pressure. Fails silently if user denies or API unavailable.
    try {
      if (navigator.storage?.persist) {
        const persisted = await navigator.storage.persist();
        if (!persisted) {
          console.warn("[OPFS] Persistent storage request denied by browser");
        }
      }
    } catch {
      // persist() not available — non-critical
    }
  }

  private assertInitialized(): void {
    if (!this.entriesDir || !this.videosDir) {
      throw new Error("OPFSStorage not initialized. Call init() first.");
    }
  }

  async save(entry: DiaryEntry): Promise<void> {
    this.assertInitialized();

    try {
      // Write video blob first (so we don't create orphan metadata if this fails)
      if (entry.videoBlob) {
        const videoFile = await this.videosDir!.getFileHandle(
          `${entry.id}.webm`,
          { create: true },
        );
        const writable = await videoFile.createWritable();
        await writable.write(entry.videoBlob);
        await writable.close();
      }

      // Write metadata JSON last (after video blob succeeds)
      const meta = entryToMeta(entry);
      const metaFile = await this.entriesDir!.getFileHandle(
        `${entry.id}.json`,
        { create: true },
      );
      const writable = await metaFile.createWritable();
      await writable.write(JSON.stringify(meta));
      await writable.close();
    } catch (err) {
      // Check for quota exceeded
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.name === "AbortError")
      ) {
        throw new Error(
          "Storage quota exceeded. Try downloading or deleting some recordings to free up space.",
        );
      }
      throw err;
    }
  }

  async get(id: string): Promise<DiaryEntry | null> {
    this.assertInitialized();
    try {
      const metaFile = await this.entriesDir!.getFileHandle(`${id}.json`);
      const file = await metaFile.getFile();
      const text = await file.text();
      const meta: DiaryEntryMeta = JSON.parse(text);
      return metaToEntry(meta);
    } catch {
      return null;
    }
  }

  async getAll(): Promise<DiaryEntry[]> {
    this.assertInitialized();
    const entries: DiaryEntry[] = [];

    for await (const [name, handle] of this.entriesDir!.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".json")) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const text = await file.text();
        const meta: DiaryEntryMeta = JSON.parse(text);
        entries.push(metaToEntry(meta));
      } catch {
        // Skip corrupt entries
        console.warn(`[OPFS] Skipping corrupt entry file: ${name}`);
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async update(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    this.assertInitialized();
    const existing = await this.get(id);
    if (!existing) return;

    const updated = { ...existing, ...updates };

    // If video blob is being updated, write it
    if (updates.videoBlob) {
      const videoFile = await this.videosDir!.getFileHandle(`${id}.webm`, {
        create: true,
      });
      const writable = await videoFile.createWritable();
      await writable.write(updates.videoBlob);
      await writable.close();
    }

    // Write updated metadata
    const meta = entryToMeta(updated);
    const metaFile = await this.entriesDir!.getFileHandle(`${id}.json`, {
      create: true,
    });
    const writable = await metaFile.createWritable();
    await writable.write(JSON.stringify(meta));
    await writable.close();
  }

  async delete(id: string): Promise<void> {
    this.assertInitialized();

    // Revoke blob URL if somehow still in memory
    const entry = await this.get(id);
    if (entry?.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }

    // Remove files — ignore errors if they don't exist
    try {
      await this.entriesDir!.removeEntry(`${id}.json`);
    } catch {
      // Already deleted or doesn't exist
    }
    try {
      await this.videosDir!.removeEntry(`${id}.webm`);
    } catch {
      // Already deleted or doesn't exist
    }
  }

  /**
   * Lazy-load a video blob from OPFS for a specific entry.
   * Returns the Blob, or null if the video file doesn't exist.
   */
  async loadVideoBlob(id: string): Promise<Blob | null> {
    this.assertInitialized();
    try {
      const videoFile = await this.videosDir!.getFileHandle(`${id}.webm`);
      const file = await videoFile.getFile();
      return file;
    } catch {
      return null;
    }
  }
}

/** Check if the OPFS API is available in this browser */
export function isOPFSAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    "getDirectory" in navigator.storage
  );
}

/** Storage quota information */
export interface StorageQuota {
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  persisted: boolean;
}

/**
 * Get current storage quota and usage.
 * Returns null if the StorageManager API is unavailable.
 */
export async function getStorageQuota(): Promise<StorageQuota | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const persisted = navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : false;
    return {
      usageBytes: usage,
      quotaBytes: quota,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
      persisted,
    };
  } catch {
    return null;
  }
}

/**
 * Format bytes into a human-readable string.
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
