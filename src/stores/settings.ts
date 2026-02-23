import { createSignal } from "solid-js";
import type { AppSettings, VideoQuality } from "~/models/types";

const defaultSettings: AppSettings = {
  defaultTemplateId: "holographic",
  videoQuality: "medium",
  maxDuration: 1800, // 30 minutes
  autoGenerateTitle: true,
};

const [settings, setSettings] = createSignal<AppSettings>({ ...defaultSettings });

export const settingsStore = {
  settings,

  updateSettings(updates: Partial<AppSettings>): void {
    setSettings((prev) => ({ ...prev, ...updates }));
  },

  getQuality(): VideoQuality {
    return settings().videoQuality;
  },
};
