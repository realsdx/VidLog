import type {
  DiaryEntry,
  DiaryEntryMeta,
  CloudStatus,
  StorageProviderType,
} from "~/models/types";

/** Declares what a storage provider can do — used by consumer code instead of type-casting. */
export interface StorageCapabilities {
  /** Data survives page refresh */
  persistent: boolean;
  /** videoBlob is null on getAll(), loaded on demand via loadVideoBlob() */
  lazyBlobs: boolean;
  /** Supports getQuota() */
  quota: boolean;
  /** Needs user gesture for access (e.g. filesystem permission prompt) */
  requiresPermission: boolean;
  /** Files are visible in the OS file manager */
  userVisibleFiles: boolean;
}

/** Summary of external changes detected by a filesystem observer. */
export interface ChangeSummary {
  added: number;
  removed: number;
  modified: number;
}

/**
 * Storage provider interface.
 * Implementations handle persisting diary entries and their video blobs.
 */
export interface IStorageProvider {
  readonly name: string;
  readonly capabilities: StorageCapabilities;

  save(entry: DiaryEntry): Promise<void>;
  get(id: string): Promise<DiaryEntry | null>;
  getAll(): Promise<DiaryEntry[]>;
  update(id: string, updates: Partial<DiaryEntry>): Promise<void>;
  delete(id: string): Promise<void>;

  /** Initialize the provider (e.g. open directory handles). Optional — not all providers need it. */
  init?(): Promise<void>;

  /** Clean up resources (e.g. release handles). Optional. */
  dispose?(): Promise<void>;

  /** Lazy-load a video blob by entry ID. Providers with lazyBlobs capability must implement this. */
  loadVideoBlob?(id: string): Promise<Blob | null>;

  /** Get storage quota info. Providers with quota capability must implement this. */
  getQuota?(): Promise<{ usageBytes: number; quotaBytes: number } | null>;

  /** Scan for orphan files (video without metadata) and remove them. Optional. */
  cleanup?(): Promise<{ orphansRemoved: number }>;

  /**
   * Start observing the storage directory for external changes.
   * Calls `onChange` with a summary when files are added/removed/modified outside the app.
   * Only providers with userVisibleFiles capability should implement this.
   */
  startObserving?(onChange: (summary: ChangeSummary) => void): void;

  /** Stop observing the storage directory for external changes. */
  stopObserving?(): void;
}

/**
 * Defensively reconstruct a DiaryEntry from stored JSON metadata.
 * Supplies defaults for any fields that may be missing (schema evolution).
 * Used by OPFSStorage and FilesystemStorage instead of hand-written metaToEntry().
 */
export function deserializeMeta(raw: Record<string, unknown>): DiaryEntry {
  const createdAt = Number(raw.createdAt ?? 0);
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? "Untitled"),
    createdAt,
    updatedAt: Number(raw.updatedAt ?? createdAt),
    duration: Number(raw.duration ?? 0),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    templateId: String(raw.templateId ?? "holographic"),
    storageProvider: (raw.storageProvider as StorageProviderType) ?? "ephemeral",
    thumbnailDataUrl: (raw.thumbnailDataUrl as string | null) ?? null,
    cloudStatus: (raw.cloudStatus as CloudStatus) ?? "none",
    cloudProvider: (raw.cloudProvider as string | null) ?? null,
    cloudFileId: (raw.cloudFileId as string | null) ?? null,
    cloudUrl: (raw.cloudUrl as string | null) ?? null,
    cloudError: (raw.cloudError as string | null) ?? null,
    videoBlob: null,
    videoBlobUrl: null,
  };
}

/**
 * Convert a DiaryEntry to its serializable metadata subset.
 * Strips Blob and object URL fields that can't be JSON-serialized.
 */
export function entryToMeta(entry: DiaryEntry): DiaryEntryMeta {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
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
