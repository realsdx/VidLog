/** Unique identifier type */
export type EntryId = string;

/** Cloud sync status */
export type CloudStatus = "none" | "uploading" | "uploaded" | "error";

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

/** Storage provider type */
export type StorageProviderType = "ephemeral" | "opfs";

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
  duration: number;
  tags: string[];
  templateId: string;

  /** Which storage provider this entry lives in */
  storageProvider: StorageProviderType;

  videoBlob: Blob | null;
  videoBlobUrl: string | null;

  thumbnailDataUrl: string | null;

  cloudStatus: CloudStatus;
  cloudProvider: string | null;
  cloudFileId: string | null;
  cloudUrl: string | null;
  cloudError: string | null;
}

/** Serializable subset of DiaryEntry — stored as JSON in OPFS. Excludes Blob/URL fields. */
export interface DiaryEntryMeta {
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  tags: string[];
  templateId: string;
  storageProvider: StorageProviderType;
  thumbnailDataUrl: string | null;
  cloudStatus: CloudStatus;
  cloudProvider: string | null;
  cloudFileId: string | null;
  cloudUrl: string | null;
  cloudError: string | null;
}

/** Frame data passed to template renderers every animation frame */
export interface TemplateFrame {
  width: number;
  height: number;
  timestamp: number;
  elapsed: number;
  isRecording: boolean;
  title: string;
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
  maxDuration: number;
  autoGenerateTitle: boolean;
  activeStorageProvider: StorageProviderType;
}

/** Onboarding state — persisted to localStorage */
export interface OnboardingState {
  completed: boolean;
  storageChoice: StorageProviderType;
  completedAt: number | null;
}
