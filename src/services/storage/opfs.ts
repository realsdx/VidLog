import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider, StorageCapabilities } from "./types";
import { deserializeMeta, entryToMeta } from "./types";
import { getExtensionForMimeType } from "~/utils/format";

/**
 * OPFS Storage Provider — persists diary entries to the Origin Private File System.
 *
 * Directory layout:
 *   /vidlog/
 *     entries/{id}.json          — serialized DiaryEntryMeta
 *     videos/{id}.{mp4|webm}    — video blob (extension derived from mimeType)
 *
 * Thumbnails are stored inline as base64 data URLs in the metadata JSON
 * to avoid extra file I/O for the common "load library grid" path.
 *
 * Video blobs are lazy-loaded: null on initial getAll(), populated
 * only when loadVideoBlob() is called (e.g. when user opens an entry).
 */
export class OPFSStorage implements IStorageProvider {
  readonly name = "opfs";
  readonly capabilities: StorageCapabilities = {
    persistent: true,
    lazyBlobs: true,
    quota: true,
    requiresPermission: false,
    userVisibleFiles: false,
  };

  private root: FileSystemDirectoryHandle | null = null;
  private entriesDir: FileSystemDirectoryHandle | null = null;
  private videosDir: FileSystemDirectoryHandle | null = null;

  /** Initialize OPFS directory structure. Must be called before any other method. */
  async init(): Promise<void> {
    const opfsRoot = await navigator.storage.getDirectory();
    this.root = await opfsRoot.getDirectoryHandle("vidlog", {
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
        const ext = getExtensionForMimeType(entry.mimeType);
        const videoFile = await this.videosDir!.getFileHandle(
          `${entry.id}${ext}`,
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
      return deserializeMeta(JSON.parse(text));
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
        entries.push(deserializeMeta(JSON.parse(text)));
      } catch {
        // Skip corrupt entries
        console.warn(`[OPFS] Skipping corrupt entry file: ${name}`);
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async update(entry: DiaryEntry, updates: Partial<DiaryEntry>): Promise<void> {
    this.assertInitialized();
    const existing = await this.get(entry.id);
    if (!existing) return;

    const updated = { ...existing, ...updates };

    // If video blob is being updated, write it
    if (updates.videoBlob) {
      const ext = getExtensionForMimeType(updated.mimeType);
      const videoFile = await this.videosDir!.getFileHandle(`${entry.id}${ext}`, {
        create: true,
      });
      const writable = await videoFile.createWritable();
      await writable.write(updates.videoBlob);
      await writable.close();
    }

    // Write updated metadata
    const meta = entryToMeta(updated);
    const metaFile = await this.entriesDir!.getFileHandle(`${entry.id}.json`, {
      create: true,
    });
    const writable = await metaFile.createWritable();
    await writable.write(JSON.stringify(meta));
    await writable.close();
  }

  async delete(entry: DiaryEntry): Promise<void> {
    this.assertInitialized();

    // Revoke blob URL if somehow still in memory
    if (entry.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }

    // Remove files — ignore errors if they don't exist
    try {
      await this.entriesDir!.removeEntry(`${entry.id}.json`);
    } catch {
      // Already deleted or doesn't exist
    }
    try {
      const ext = getExtensionForMimeType(entry.mimeType);
      await this.videosDir!.removeEntry(`${entry.id}${ext}`);
    } catch {
      // Already deleted or doesn't exist
    }
  }

  /**
   * Lazy-load a video blob from OPFS for a specific entry.
   * Returns the Blob, or null if the video file doesn't exist.
   */
  async loadVideoBlob(entry: DiaryEntry): Promise<Blob | null> {
    this.assertInitialized();
    try {
      const ext = getExtensionForMimeType(entry.mimeType);
      const videoFile = await this.videosDir!.getFileHandle(`${entry.id}${ext}`);
      const file = await videoFile.getFile();
      return file;
    } catch {
      return null;
    }
  }

  /**
   * Get storage quota info for OPFS.
   */
  async getQuota(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
    try {
      if (!navigator.storage?.estimate) return null;
      const estimate = await navigator.storage.estimate();
      return {
        usageBytes: estimate.usage ?? 0,
        quotaBytes: estimate.quota ?? 0,
      };
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
 * @deprecated Use `formatBytes` from `~/utils/format` directly.
 */
export { formatBytes as formatStorageSize } from "~/utils/format";
