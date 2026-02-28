import type { DiaryEntry, DiaryEntryMeta } from "~/models/types";

// ---------------------------------------------------------------------------
// Cloud Provider Types
// ---------------------------------------------------------------------------

/** Supported cloud provider identifiers */
export type CloudProviderType = "google-drive";

/** Reference to a file stored in a cloud provider */
export interface CloudFileRef {
  /** Which cloud provider hosts this file */
  provider: CloudProviderType;
  /** Provider-specific file identifier (e.g. Google Drive file ID) */
  fileId: string;
  /** MIME type of the stored file */
  mimeType: string;
}

/** Sync status for individual entries */
export type CloudSyncEntryStatus =
  | "pending"     // queued for upload
  | "uploading"   // upload in progress
  | "synced"      // video + metadata both in cloud and locally
  | "cloud-only"  // metadata is local but video exists only in cloud
  | "failed";     // last upload attempt failed

/** Cloud sync metadata attached to a diary entry */
export interface CloudSyncInfo {
  provider: CloudProviderType;
  /** Reference to the video file in cloud — null until upload completes */
  videoFileRef: CloudFileRef | null;
  /** Reference to the metadata file in cloud — null until upload completes */
  metaFileRef: CloudFileRef | null;
  /** Timestamp of last successful sync */
  syncedAt: number;
  status: CloudSyncEntryStatus;
  /** Error message from last failed attempt, if any */
  lastError?: string;
}

/** Upload progress for a single entry */
export interface UploadProgress {
  entryId: string;
  bytesUploaded: number;
  bytesTotal: number;
  /** 0–1 fraction */
  fraction: number;
}

/** Overall sync status */
export type SyncStatus = "idle" | "syncing" | "error";

/** Aggregate sync progress */
export interface SyncProgress {
  /** Number of entries processed so far */
  current: number;
  /** Total entries in this sync batch */
  total: number;
  /** Currently uploading entry ID */
  currentEntryId: string | null;
  /** Upload progress for the current entry */
  uploadProgress: UploadProgress | null;
}

/** Item in the persistent sync queue */
export interface SyncQueueItem {
  entryId: string;
  /** When this item was added to the queue */
  queuedAt: number;
  /** Number of failed attempts */
  retryCount: number;
  /** Timestamp of last attempt */
  lastAttemptAt: number | null;
}

/** Cloud storage quota info */
export interface CloudQuota {
  usageBytes: number;
  totalBytes: number;
  usagePercent: number;
}

// ---------------------------------------------------------------------------
// Cloud Provider Interface
// ---------------------------------------------------------------------------

/**
 * Interface for cloud storage backends.
 *
 * Cloud providers are NOT storage providers — they don't participate in the
 * StorageManager read/write flow. Instead, they provide a separate upload/
 * download/metadata layer that syncs with local storage providers.
 */
export interface ICloudProvider {
  /** Provider identifier */
  readonly name: CloudProviderType;

  /** Whether the user is currently authenticated (reactive signal) */
  readonly isAuthenticated: () => boolean;

  /** User-facing display name (e.g. user's email) — null if not connected */
  readonly userDisplayName: () => string | null;

  // -- Authentication -------------------------------------------------------

  /** Initiate OAuth sign-in flow. Resolves when auth is complete. */
  signIn(): Promise<void>;

  /** Sign out and clear tokens. */
  signOut(): Promise<void>;

  /**
   * Check if a previous session can be restored (e.g. token still valid).
   * Called on app boot. Returns true if the user is still authenticated.
   */
  tryRestoreSession(): Promise<boolean>;

  // -- Video operations -----------------------------------------------------

  /**
   * Upload a video blob to cloud storage.
   * Uses resumable upload for large files.
   * @param entryId Unique entry identifier used as the file name
   * @param blob Video blob to upload
   * @param mimeType MIME type of the video
   * @param onProgress Optional callback for upload progress
   * @returns Reference to the uploaded file
   */
  uploadVideo(
    entryId: string,
    blob: Blob,
    mimeType: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<CloudFileRef>;

  /**
   * Download a video blob from cloud storage.
   * @param fileRef Reference to the cloud file
   * @returns The video blob
   */
  downloadVideo(fileRef: CloudFileRef): Promise<Blob>;

  /**
   * Get a URL that can be used as a <video> src for playback.
   * Downloads the video and returns a local object URL. Caller must
   * revoke the URL via URL.revokeObjectURL() when done.
   * @param fileRef Reference to the cloud file
   * @returns A blob: URL string suitable for <video src="...">
   */
  getVideoStreamUrl(fileRef: CloudFileRef): Promise<string>;

  /**
   * Delete a video from cloud storage.
   * @param fileRef Reference to the cloud file
   */
  deleteVideo(fileRef: CloudFileRef): Promise<void>;

  // -- Metadata operations --------------------------------------------------

  /**
   * Upload entry metadata (JSON) to cloud storage.
   * @param entryId Entry identifier
   * @param meta Serializable metadata
   * @returns Reference to the uploaded metadata file
   */
  uploadMeta(entryId: string, meta: DiaryEntryMeta): Promise<CloudFileRef>;

  /**
   * Download all entry metadata from cloud storage.
   * Used to discover cloud-only entries and reconcile with local state.
   * @returns Array of metadata objects with their cloud file references
   */
  downloadAllMeta(): Promise<
    Array<{ meta: DiaryEntryMeta; metaFileRef: CloudFileRef; videoFileRef: CloudFileRef | null }>
  >;

  /**
   * Delete metadata from cloud storage.
   * @param fileRef Reference to the metadata file
   */
  deleteMeta(fileRef: CloudFileRef): Promise<void>;

  // -- Quota ----------------------------------------------------------------

  /**
   * Get cloud storage quota information.
   * @returns Quota info or null if not available
   */
  getQuota(): Promise<CloudQuota | null>;
}

// ---------------------------------------------------------------------------
// Re-export model types used by cloud consumers
// ---------------------------------------------------------------------------
export type { DiaryEntry, DiaryEntryMeta };
