import { createSignal, Show, onMount } from "solid-js";
import { settingsStore } from "~/stores/settings";
import { templateStore } from "~/stores/template";
import { diaryStore } from "~/stores/diary";
import { storageManager } from "~/services/storage/manager";
import { activateOPFS } from "~/services/init";
import { isOPFSAvailable, getStorageQuota, formatStorageSize } from "~/services/storage/opfs";
import type { StorageQuota } from "~/services/storage/opfs";
import type { VideoQuality, StorageProviderType } from "~/models/types";

export default function Settings() {
  const settings = settingsStore.settings;
  const templates = templateStore.getTemplates();
  const [switchWarning, setSwitchWarning] = createSignal<string | null>(null);
  const [switching, setSwitching] = createSignal(false);
  const [quota, setQuota] = createSignal<StorageQuota | null>(null);

  // Load storage quota on mount and after provider switches
  async function refreshQuota() {
    const q = await getStorageQuota();
    setQuota(q);
  }

  onMount(() => {
    refreshQuota();
  });

  function handleQualityChange(quality: VideoQuality) {
    settingsStore.updateSettings({ videoQuality: quality });
  }

  function handleDefaultTemplate(templateId: string) {
    settingsStore.updateSettings({ defaultTemplateId: templateId });
    templateStore.setTemplateById(templateId);
  }

  function handleMaxDuration(minutes: number) {
    settingsStore.updateSettings({ maxDuration: minutes * 60 });
  }

  function handleAutoTitle(enabled: boolean) {
    settingsStore.updateSettings({ autoGenerateTitle: enabled });
  }

  async function handleStorageChange(provider: StorageProviderType) {
    if (provider === settings().activeStorageProvider) return;

    setSwitchWarning(null);
    setSwitching(true);

    if (provider === "opfs") {
      const ok = await activateOPFS();
      if (!ok) {
        setSwitchWarning(
          "Failed to initialize local storage (OPFS). Your browser may not support it.",
        );
        setSwitching(false);
        return;
      }
      settingsStore.updateSettings({ activeStorageProvider: "opfs" });
      storageManager.setActiveProvider("opfs");
      // Reload entries to include any OPFS entries
      await diaryStore.loadEntries();
      refreshQuota();
    } else {
      // Switching to ephemeral
      settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
      storageManager.setActiveProvider("ephemeral");
    }

    setSwitching(false);
  }

  const opfsAvailable = isOPFSAvailable();

  return (
    <div class="w-full max-w-2xl flex flex-col gap-8 animate-slide-up-in">
      <h1 class="text-xl font-display font-bold tracking-wider text-text-primary">
        SETTINGS
      </h1>

      {/* Storage section */}
      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-mono font-bold uppercase tracking-wider text-text-secondary border-b border-border-default pb-2">
          Storage
        </h2>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <label for="storage-provider" class="text-sm text-text-primary">
                Active Storage Provider
              </label>
              <span id="storage-provider-desc" class="text-xs text-text-secondary font-mono">
                Where new recordings are saved
              </span>
            </div>
            <select
              id="storage-provider"
              aria-describedby="storage-provider-desc"
              class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30"
              value={settings().activeStorageProvider}
              onChange={(e) =>
                handleStorageChange(
                  e.currentTarget.value as StorageProviderType,
                )
              }
              disabled={switching()}
            >
              <option value="ephemeral">In-Memory (session only)</option>
              <option value="opfs" disabled={!opfsAvailable}>
                Local Storage (OPFS)
                {!opfsAvailable ? " — not available" : ""}
              </option>
            </select>
          </div>

          {/* Warning when switching to ephemeral */}
          <Show
            when={settings().activeStorageProvider === "ephemeral"}
          >
            <div class="p-3 rounded-md border border-accent-amber/30 bg-accent-amber/5 text-xs font-mono text-accent-amber/80">
              New recordings will only exist in memory and will be lost when you
              close the tab. Your existing local recordings will still be
              accessible in the library.
            </div>
          </Show>

          {/* Error warning */}
          <Show when={switchWarning()}>
            <div class="p-3 rounded-md border border-accent-red/30 bg-accent-red/5 text-xs font-mono text-accent-red/80">
              {switchWarning()}
            </div>
          </Show>

          {/* Storage quota display */}
          <Show when={quota()}>
            {(q) => {
              const pct = q().usagePercent;
              const barColor =
                pct >= 90
                  ? "bg-accent-red"
                  : pct >= 75
                    ? "bg-accent-amber"
                    : "bg-accent-cyan";
              return (
                <div class="flex flex-col gap-2 p-3 rounded-md border border-border-default bg-bg-elevated">
                  <div class="flex items-center justify-between text-xs font-mono text-text-secondary">
                    <span>Storage Used</span>
                    <span>
                      {formatStorageSize(q().usageBytes)} / {formatStorageSize(q().quotaBytes)}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div class="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      class={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div class="flex items-center justify-between text-xs font-mono">
                    <span class={pct >= 90 ? "text-accent-red" : "text-text-secondary/60"}>
                      {pct.toFixed(1)}% used
                    </span>
                    <span class={`text-xs ${q().persisted ? "text-accent-green/70" : "text-accent-amber/70"}`}>
                      {q().persisted ? "Persistent" : "Not persistent (browser may evict)"}
                    </span>
                  </div>
                  <Show when={pct >= 80}>
                    <div class="p-2 rounded border border-accent-amber/30 bg-accent-amber/5 text-xs font-mono text-accent-amber/80">
                      Storage is running low. Consider downloading or deleting older recordings to free up space.
                    </div>
                  </Show>
                </div>
              );
            }}
          </Show>
        </div>
      </section>

      {/* Recording section */}
      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-mono font-bold uppercase tracking-wider text-text-secondary border-b border-border-default pb-2">
          Recording
        </h2>

        {/* Default template */}
        <div class="flex items-center justify-between">
          <label for="default-template" class="text-sm text-text-primary">Default Template</label>
          <select
            id="default-template"
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30"
            value={settings().defaultTemplateId}
            onChange={(e) => handleDefaultTemplate(e.currentTarget.value)}
          >
            {templates.map((t) => (
              <option value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Video quality */}
        <div class="flex items-center justify-between">
          <label for="video-quality" class="text-sm text-text-primary">Video Quality</label>
          <select
            id="video-quality"
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30"
            value={settings().videoQuality}
            onChange={(e) =>
              handleQualityChange(e.currentTarget.value as VideoQuality)
            }
          >
            <option value="low">Low (480p)</option>
            <option value="medium">Medium (720p)</option>
            <option value="high">High (1080p)</option>
          </select>
        </div>

        {/* Max duration */}
        <div class="flex items-center justify-between">
          <label for="max-duration" class="text-sm text-text-primary">Max Duration</label>
          <select
            id="max-duration"
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30"
            value={settings().maxDuration / 60}
            onChange={(e) =>
              handleMaxDuration(parseInt(e.currentTarget.value))
            }
          >
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>

        {/* Auto title */}
        <div class="flex items-center justify-between">
          <label id="auto-title-label" class="text-sm text-text-primary">Auto-generate Title</label>
          <button
            role="switch"
            aria-checked={settings().autoGenerateTitle}
            aria-labelledby="auto-title-label"
            class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 ${
              settings().autoGenerateTitle
                ? "bg-accent-cyan/40"
                : "bg-bg-elevated border border-border-default"
            }`}
            onClick={() => handleAutoTitle(!settings().autoGenerateTitle)}
          >
            <span
              class={`inline-block h-4 w-4 rounded-full bg-text-primary transition-transform ${
                settings().autoGenerateTitle
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Cloud section */}
      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-mono font-bold uppercase tracking-wider text-text-secondary border-b border-border-default pb-2">
          Cloud Accounts
        </h2>

        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-sm text-text-primary">Google Drive</span>
            <span class="text-xs text-text-secondary font-mono">
              Coming in Phase 6
            </span>
          </div>
          <button
            class="px-3 py-1.5 rounded-md text-xs font-mono border border-border-default text-text-secondary cursor-not-allowed opacity-50"
            disabled
          >
            Connect
          </button>
        </div>
      </section>

      {/* About section */}
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-mono font-bold uppercase tracking-wider text-text-secondary border-b border-border-default pb-2">
          About
        </h2>
        <div class="flex flex-col gap-1 text-xs font-mono text-text-secondary">
          <span>VideoDiary v0.1.0</span>
          <span>Built with SolidJS + Vite + Tailwind CSS</span>
          <span>Chrome/Edge recommended</span>
        </div>
      </section>
    </div>
  );
}
