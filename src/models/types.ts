/** Unique identifier type */
export type EntryId = string;

/** Cloud sync status */
export type CloudStatus = "none" | "uploading" | "uploaded" | "error";

/** Cloud provider type */
export type CloudProviderType = "google-drive";

/** Cloud sync entry status — tracks the sync lifecycle of individual entries */
export type CloudSyncEntryStatus =
  | "pending"
  | "uploading"
  | "synced"
  | "cloud-only"
  | "failed";

/** Reference to a file stored in a cloud provider */
export interface CloudFileRef {
  provider: CloudProviderType;
  fileId: string;
  mimeType: string;
}

/** Cloud sync metadata attached to a diary entry */
export interface CloudSyncInfo {
  provider: CloudProviderType;
  /** Reference to the video file in cloud — null until upload completes */
  videoFileRef: CloudFileRef | null;
  /** Reference to the metadata file in cloud — null until upload completes */
  metaFileRef: CloudFileRef | null;
  syncedAt: number;
  status: CloudSyncEntryStatus;
  lastError?: string;
}

/** Recording status */
export type RecordingStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "recording"
  | "paused"
  | "stopped"
  | "error";

/** Video quality preset */
export type VideoQuality = "low" | "medium" | "high";

/** Recording profile — controls bitrate/fps/audio independently of resolution */
export type RecordingProfile = "standard" | "efficient";

/** Recording format — determines container and codec family */
export type RecordingFormat = "av1" | "h264" | "webm";

/** Storage provider type */
export type StorageProviderType = "ephemeral" | "opfs" | "filesystem";

/** Video quality settings mapped from presets */
export const VIDEO_QUALITY_MAP: Record<
  VideoQuality,
  { width: number; height: number; bitrate: number }
> = {
  low: { width: 640, height: 480, bitrate: 1_000_000 },
  medium: { width: 1280, height: 720, bitrate: 2_500_000 },
  high: { width: 1920, height: 1080, bitrate: 5_000_000 },
};

/** A single video diary entry */
export interface DiaryEntry {
  id: EntryId;
  title: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  tags: string[];
  templateId: string;

  /** Which storage provider this entry lives in */
  storageProvider: StorageProviderType;

  /** MIME type of the recorded video (e.g. "video/mp4;codecs=av01,opus") */
  mimeType: string;

  videoBlob: Blob | null;
  videoBlobUrl: string | null;

  thumbnailDataUrl: string | null;

  cloudStatus: CloudStatus;
  cloudProvider: string | null;
  cloudFileId: string | null;
  cloudUrl: string | null;
  cloudError: string | null;

  /** Structured cloud sync info — used by the cloud sync system */
  cloudSync?: CloudSyncInfo;
}

/** Serializable subset of DiaryEntry — stored as JSON in OPFS. Excludes Blob/URL fields. */
export interface DiaryEntryMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  tags: string[];
  templateId: string;
  storageProvider: StorageProviderType;
  /** MIME type of the recorded video (e.g. "video/mp4;codecs=av01,opus") */
  mimeType: string;
  thumbnailDataUrl: string | null;
  cloudStatus: CloudStatus;
  cloudProvider: string | null;
  cloudFileId: string | null;
  cloudUrl: string | null;
  cloudError: string | null;

  /** Structured cloud sync info — used by the cloud sync system */
  cloudSync?: CloudSyncInfo;
}

/** Frame data passed to template renderers every animation frame */
export interface TemplateFrame {
  width: number;
  height: number;
  timestamp: number;
  elapsed: number;
  isRecording: boolean;
  title: string;
  /** Normalized 0-1 RMS audio level from the microphone */
  audioLevel: number;
  /** Raw frequency bins from AnalyserNode (null when no audio track available) */
  audioFrequencyData: Uint8Array | null;
}

/** Configuration for a template's visual style */
export interface TemplateConfig {
  colorPrimary: string;
  colorSecondary: string;
  colorBackground: string;
  fontFamily: string;
  showTimestamp: boolean;
  showElapsed: boolean;
  showRecordingIndicator: boolean;
  showScanLines: boolean;
  cornerStyle: "brackets" | "rounded" | "angular" | "none";
}

/** A template definition */
export interface DiaryTemplate {
  id: string;
  name: string;
  description: string;
  previewImageUrl: string;
  render: (ctx: CanvasRenderingContext2D, frame: TemplateFrame) => void;
  config: TemplateConfig;
}

/** Recording state */
export interface RecordingState {
  status: RecordingStatus;
  stream: MediaStream | null;
  elapsed: number;
  maxDuration: number;
  error: string | null;
  selectedDeviceId: string | null;
  resolution: { width: number; height: number };
}

/** App-level settings */
export interface AppSettings {
  defaultTemplateId: string;
  videoQuality: VideoQuality;
  recordingProfile: RecordingProfile;
  recordingFormat: RecordingFormat;
  maxDuration: number;
  autoGenerateTitle: boolean;
  activeStorageProvider: StorageProviderType;
  /** Whether to automatically sync OPFS entries to cloud when connected */
  cloudAutoSync: boolean;
}

/** Onboarding state — persisted to localStorage */
export interface OnboardingState {
  completed: boolean;
  storageChoice: StorageProviderType;
  completedAt: number | null;
}
