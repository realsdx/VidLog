import {
  VIDEO_QUALITY_MAP,
  type RecordingProfile,
  type VideoQuality,
} from "~/models/types";

/** Per-profile configuration that modifies recording parameters */
export interface RecordingProfileConfig {
  /** Display name shown in the UI */
  label: string;
  /** Short description for the settings page */
  description: string;
  /** Canvas capture frame rate (fps) */
  frameRate: number;
  /** Audio bitrate in bits/s passed to MediaRecorder (undefined = browser default ~128kbps) */
  audioBitsPerSecond: number | undefined;
  /** Multiplier applied to the quality preset's base video bitrate (1.0 = unchanged) */
  videoBitrateMultiplier: number;
}

/** Profile definitions */
export const RECORDING_PROFILES: Record<RecordingProfile, RecordingProfileConfig> = {
  standard: {
    label: "Standard",
    description: "Full quality recording",
    frameRate: 30,
    audioBitsPerSecond: undefined, // browser default (~128kbps Opus)
    videoBitrateMultiplier: 1.0,
  },
  efficient: {
    label: "Efficient",
    description: "Smaller files, ideal for diary entries",
    frameRate: 24,
    audioBitsPerSecond: 32_000, // 32kbps — plenty for speech
    videoBitrateMultiplier: 0.6,
  },
};

/** Fully resolved recording parameters ready to pass to RecordingEngine */
export interface ResolvedRecordingParams {
  width: number;
  height: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number | undefined;
  frameRate: number;
}

/**
 * Combine a recording profile with a quality preset to produce
 * the final set of parameters for the recording engine.
 */
export function resolveRecordingParams(
  profile: RecordingProfile,
  quality: VideoQuality,
): ResolvedRecordingParams {
  const qualityMap = VIDEO_QUALITY_MAP[quality];
  const profileConfig = RECORDING_PROFILES[profile];

  return {
    width: qualityMap.width,
    height: qualityMap.height,
    videoBitsPerSecond: Math.round(qualityMap.bitrate * profileConfig.videoBitrateMultiplier),
    audioBitsPerSecond: profileConfig.audioBitsPerSecond,
    frameRate: profileConfig.frameRate,
  };
}
