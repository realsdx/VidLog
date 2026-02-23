import { settingsStore } from "~/stores/settings";
import { templateStore } from "~/stores/template";
import type { VideoQuality } from "~/models/types";

export default function Settings() {
  const settings = settingsStore.settings;
  const templates = templateStore.getTemplates();

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

  return (
    <div class="w-full max-w-2xl flex flex-col gap-8">
      <h1 class="text-xl font-display font-bold tracking-wider text-text-primary">
        SETTINGS
      </h1>

      {/* Recording section */}
      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-mono font-bold uppercase tracking-wider text-text-secondary border-b border-border-default pb-2">
          Recording
        </h2>

        {/* Default template */}
        <div class="flex items-center justify-between">
          <label class="text-sm text-text-primary">Default Template</label>
          <select
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60"
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
          <label class="text-sm text-text-primary">Video Quality</label>
          <select
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60"
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
          <label class="text-sm text-text-primary">Max Duration</label>
          <select
            class="bg-bg-elevated border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60"
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
          <label class="text-sm text-text-primary">Auto-generate Title</label>
          <button
            class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
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
              Coming in Phase 5
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
