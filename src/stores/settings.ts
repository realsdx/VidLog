import { createSignal } from "solid-js";
import type { AppSettings, VideoQuality } from "~/models/types";

const STORAGE_KEY = "vidlog_settings";

const defaultSettings: AppSettings = {
  defaultTemplateId: "holographic",
  videoQuality: "medium",
  recordingProfile: "standard",
  recordingFormat: "av1",
  maxDuration: 1800, // 30 minutes
  autoGenerateTitle: true,
  activeStorageProvider: "ephemeral",
  cloudAutoSync: true,
};

/** Read settings from localStorage synchronously on boot */
function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle missing keys from older versions
      return { ...defaultSettings, ...parsed };
    }
  } catch {
    // Corrupted data — fall back to defaults
  }
  return { ...defaultSettings };
}

/** Write settings to localStorage */
function persistSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

const [settings, setSettings] = createSignal<AppSettings>(loadSettings());

/**
 * Transient (non-persisted) signal that tracks why the active storage provider
 * fell back to ephemeral during boot. Null when no fallback occurred.
 *
 * Possible reasons:
 * - "permission-denied"  — filesystem handle exists but user denied re-auth
 * - "unavailable"        — chosen provider's API is missing from this browser
 * - "init-failed"        — provider creation/init threw an error
 */
const [storageFallbackReason, setStorageFallbackReason] = createSignal<
  "permission-denied" | "unavailable" | "init-failed" | null
>(null);

export const settingsStore = {
  settings,
  storageFallbackReason,
  setStorageFallbackReason,

  updateSettings(updates: Partial<AppSettings>): void {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      persistSettings(next);
      return next;
    });
  },

  getQuality(): VideoQuality {
    return settings().videoQuality;
  },

  /** Reset all settings to defaults and remove persisted state */
  reset(): void {
    setSettings({ ...defaultSettings });
    localStorage.removeItem(STORAGE_KEY);
  },
};
