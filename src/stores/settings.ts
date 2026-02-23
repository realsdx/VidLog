import { createSignal } from "solid-js";
import type { AppSettings, VideoQuality } from "~/models/types";

const STORAGE_KEY = "videodiary_settings";

const defaultSettings: AppSettings = {
  defaultTemplateId: "holographic",
  videoQuality: "medium",
  maxDuration: 1800, // 30 minutes
  autoGenerateTitle: true,
  activeStorageProvider: "ephemeral",
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

export const settingsStore = {
  settings,

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
};
