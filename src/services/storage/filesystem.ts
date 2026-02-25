import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider, StorageCapabilities } from "./types";
import { deserializeMeta, entryToMeta } from "./types";

/**
 * Filesystem Storage Provider — persists diary entries to a user-visible OS folder
 * via the File System Access API.
 *
 * Directory layout (inside user-chosen folder):
 *   entries/{id}.json   — serialized DiaryEntryMeta
 *   videos/{id}.webm    — video blob
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

    try {
      // Write video blob first (so we don't create orphan metadata if this fails)
      if (entry.videoBlob) {
        const videoFile = await this.videosDir.getFileHandle(
          `${entry.id}.webm`,
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
    } catch (err) {
      // Re-throw with a friendlier message for common cases
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error(
          "Permission to write to the folder was denied. Please re-grant access in Settings.",
        );
      }
      throw err;
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

  async update(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    this.assertInitialized();
    const existing = await this.get(id);
    if (!existing) return;

    const updated = { ...existing, ...updates };

    // If video blob is being updated, write it
    if (updates.videoBlob) {
      const videoFile = await this.videosDir.getFileHandle(`${id}.webm`, {
        create: true,
      });
      const writable = await videoFile.createWritable();
      await writable.write(updates.videoBlob);
      await writable.close();
    }

    // Write updated metadata
    const meta = entryToMeta(updated);
    const metaFile = await this.entriesDir.getFileHandle(`${id}.json`, {
      create: true,
    });
    const writable = await metaFile.createWritable();
    await writable.write(JSON.stringify(meta, null, 2));
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
      await this.entriesDir.removeEntry(`${id}.json`);
    } catch {
      // Already deleted or doesn't exist
    }
    try {
      await this.videosDir.removeEntry(`${id}.webm`);
    } catch {
      // Already deleted or doesn't exist
    }
  }

  /**
   * Lazy-load a video blob for a specific entry.
   * Returns the Blob, or null if the video file doesn't exist.
   */
  async loadVideoBlob(id: string): Promise<Blob | null> {
    this.assertInitialized();
    try {
      const videoFile = await this.videosDir.getFileHandle(`${id}.webm`);
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

    // Find video files without matching entry
    let orphansRemoved = 0;
    for await (const [name, handle] of this.videosDir.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".webm")) continue;
      const id = name.replace(/\.webm$/, "");
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

  /** Get the root directory handle (for display in Settings). */
  getRootHandle(): FileSystemDirectoryHandle {
    return this.root;
  }
}

/** Check if the File System Access API is available */
export function isFilesystemAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
