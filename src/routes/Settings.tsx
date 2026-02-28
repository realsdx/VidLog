import { createSignal, createEffect, Show, onMount, For, type JSX } from "solid-js";
import { settingsStore } from "~/stores/settings";
import { templateStore } from "~/stores/template";
import { diaryStore } from "~/stores/diary";
import { cloudStore } from "~/stores/cloud";
import { storageManager } from "~/services/storage/manager";
import { activateOPFS, activateFilesystem } from "~/services/init";
import { isOPFSAvailable, getStorageQuota } from "~/services/storage/opfs";
import { formatBytes } from "~/utils/format";
import { isFilesystemAvailable, FilesystemStorage } from "~/services/storage/filesystem";
import { clearDirectoryHandle } from "~/services/storage/handle-store";
import { GoogleDriveProvider } from "~/services/cloud/google-drive";
import { googleAuth } from "~/services/cloud/auth/google";
import { cloudSyncManager } from "~/services/cloud/manager";
import type { StorageQuota } from "~/services/storage/opfs";
import type { CloudQuota } from "~/services/cloud/types";
import type { VideoQuality, StorageProviderType, RecordingProfile, RecordingFormat } from "~/models/types";
import { RECORDING_PROFILES, resolveRecordingParams } from "~/services/recorder/profiles";

type SettingsTab = "storage" | "recording" | "cloud" | "about";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "storage", label: "Storage", icon: "M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4M4 12c0 2.21 3.58 4 8 4s8-1.79 8-4" },
  { id: "recording", label: "Recording", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { id: "cloud", label: "Cloud", icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" },
  { id: "about", label: "About", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

/** Reusable card wrapper */
function SettingsCard(props: { label?: string; children: JSX.Element; class?: string }) {
  return (
    <div class={`rounded-lg border border-border-default bg-bg-elevated p-4 flex flex-col gap-3 ${props.class ?? ""}`}>
      <Show when={props.label}>
        <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-text-secondary">
          {props.label}
        </h3>
      </Show>
      {props.children}
    </div>
  );
}

/** Reusable setting row (label left, control right) */
function SettingRow(props: { children: JSX.Element; border?: boolean }) {
  return (
    <div class={`flex items-center justify-between gap-4 py-2.5 min-h-[44px] ${props.border !== false ? "border-b border-border-default/30" : ""}`}>
      {props.children}
    </div>
  );
}

/** Styled select */
const selectClass = "bg-bg-primary border border-border-default rounded-md px-3 py-2 min-h-[44px] text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30 cursor-pointer";

/** Toggle switch */
function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      class={`relative inline-flex h-7 w-12 min-w-[48px] items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 ${
        props.checked
          ? "bg-accent-cyan/40"
          : "bg-bg-primary border border-border-default"
      }`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span
        class={`inline-block h-5 w-5 rounded-full bg-text-primary transition-transform ${
          props.checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const settings = settingsStore.settings;
  const templates = templateStore.getTemplates();
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("storage");
  const [switchWarning, setSwitchWarning] = createSignal<string | null>(null);
  const [switching, setSwitching] = createSignal(false);
  const [quota, setQuota] = createSignal<StorageQuota | null>(null);
  const [fsFolderName, setFsFolderName] = createSignal<string | null>(null);
  const [clientIdInput, setClientIdInput] = createSignal(
    googleAuth.hasCustomClientId() ? (googleAuth.getClientId() ?? "") : "",
  );
  const [showDevSettings, setShowDevSettings] = createSignal(false);
  const [cloudQuota, setCloudQuota] = createSignal<CloudQuota | null>(null);

  // Fetch cloud quota reactively when connected
  createEffect(() => {
    if (cloudStore.isConnected()) {
      const p = cloudSyncManager.provider();
      if (p) {
        void p.getQuota().then((q) => setCloudQuota(q));
      }
    } else {
      setCloudQuota(null);
    }
  });

  async function refreshQuota() {
    const q = await getStorageQuota();
    setQuota(q);
  }

  function refreshFsFolderName() {
    const provider = storageManager.getProvider("filesystem");
    if (provider && provider instanceof FilesystemStorage) {
      setFsFolderName(provider.getRootHandle().name);
    } else {
      setFsFolderName(null);
    }
  }

  onMount(() => {
    refreshQuota();
    refreshFsFolderName();
  });

  // --- Handlers ---

  function handleQualityChange(quality: VideoQuality) {
    settingsStore.updateSettings({ videoQuality: quality });
  }

  function handleProfileChange(profile: RecordingProfile) {
    settingsStore.updateSettings({ recordingProfile: profile });
  }

  function handleFormatChange(format: RecordingFormat) {
    settingsStore.updateSettings({ recordingFormat: format });
  }

  function estimatedSizePerMinute(): string {
    const params = resolveRecordingParams(
      settings().recordingProfile,
      settings().videoQuality,
    );
    const audioBps = params.audioBitsPerSecond ?? 128_000;
    const totalBytesPerMin = ((params.videoBitsPerSecond + audioBps) * 60) / 8;
    return formatBytes(totalBytesPerMin);
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
      await diaryStore.loadEntries();
      refreshQuota();
    } else if (provider === "filesystem") {
      setQuota(null);
      if (storageManager.getProvider("filesystem")) {
        settingsStore.updateSettings({ activeStorageProvider: "filesystem" });
        storageManager.setActiveProvider("filesystem");
        await diaryStore.loadEntries();
      } else {
        await handlePickFolder();
      }
    } else {
      setQuota(null);
      settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
      storageManager.setActiveProvider("ephemeral");
    }

    setSwitching(false);
  }

  async function handlePickFolder() {
    setSwitchWarning(null);
    try {
      const handle = await window.showDirectoryPicker({
        id: "vidlog-vault",
        mode: "readwrite",
        startIn: "videos",
      });

      const ok = await activateFilesystem(handle);
      if (!ok) {
        setSwitchWarning("Failed to initialize the selected folder.");
        return;
      }

      settingsStore.updateSettings({ activeStorageProvider: "filesystem" });
      setFsFolderName(handle.name);
      await diaryStore.loadEntries();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setSwitchWarning("Could not access the selected folder.");
    }
  }

  async function handleChangeFolder() {
    setSwitching(true);
    await handlePickFolder();
    setSwitching(false);
  }

  async function handleDisconnectFolder() {
    setSwitchWarning(null);
    await clearDirectoryHandle();
    settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
    storageManager.setActiveProvider("ephemeral");
    setFsFolderName(null);
    await diaryStore.loadEntries();
  }

  async function handleConnectDrive() {
    try {
      const provider = new GoogleDriveProvider();
      await cloudStore.connect(provider);
    } catch {
      // Error already shown via toast in cloudStore.connect()
    }
  }

  async function handleDisconnectDrive() {
    await cloudStore.disconnect();
  }

  const opfsAvailable = isOPFSAvailable();
  const fsAvailable = isFilesystemAvailable();

  return (
    <div class="w-full max-w-2xl flex flex-col gap-5 animate-slide-up-in">
      {/* Header */}
      <h1 class="text-xl font-display font-bold tracking-wider text-text-primary">
        SETTINGS
      </h1>

      {/* Tab bar */}
      <nav class="flex border-b border-border-default" role="tablist">
        <For each={TABS}>
          {(tab) => (
            <button
              role="tab"
              aria-selected={activeTab() === tab.id}
              aria-controls={`panel-${tab.id}`}
              class={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono tracking-wide transition-colors cursor-pointer relative ${
                activeTab() === tab.id
                  ? "text-accent-cyan"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="hidden sm:block shrink-0">
                <path d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
              {/* Active indicator */}
              <Show when={activeTab() === tab.id}>
                <div class="absolute bottom-0 left-2 right-2 h-0.5 bg-accent-cyan rounded-full" />
              </Show>
            </button>
          )}
        </For>
      </nav>

      {/* ─── Storage Tab ─── */}
      <Show when={activeTab() === "storage"}>
        <div id="panel-storage" role="tabpanel" class="flex flex-col gap-4">
          {/* Provider card */}
          <SettingsCard label="Active Provider">
            <SettingRow>
              <div class="flex flex-col min-w-0">
                <label for="storage-provider" class="text-sm text-text-primary">
                  Storage Mode
                </label>
                <span id="storage-provider-desc" class="text-xs text-text-secondary/70 font-mono">
                  Where new recordings are saved
                </span>
              </div>
              <select
                id="storage-provider"
                aria-describedby="storage-provider-desc"
                class={selectClass}
                value={settings().activeStorageProvider}
                onChange={(e) =>
                  handleStorageChange(e.currentTarget.value as StorageProviderType)
                }
                disabled={switching()}
              >
                <option value="ephemeral">In-Memory (session)</option>
                <option value="opfs" disabled={!opfsAvailable}>
                  Local Storage (OPFS){!opfsAvailable ? " — unavailable" : ""}
                </option>
                <option value="filesystem" disabled={!fsAvailable}>
                  Filesystem Folder{!fsAvailable ? " — unavailable" : ""}
                </option>
              </select>
            </SettingRow>

            {/* Filesystem folder info */}
            <Show when={settings().activeStorageProvider === "filesystem" && fsFolderName()}>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-md bg-bg-primary/50 border border-border-default/50">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[10px] font-mono text-text-secondary/60 uppercase tracking-wider">Active Folder</span>
                  <span class="text-sm font-mono text-text-primary">{fsFolderName()}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="px-3 py-1.5 rounded-md text-xs font-mono border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors cursor-pointer min-h-[36px]"
                    onClick={handleChangeFolder}
                    disabled={switching()}
                  >
                    Change
                  </button>
                  <button
                    class="px-3 py-1.5 rounded-md text-xs font-mono border border-accent-red/30 text-accent-red/70 hover:text-accent-red hover:border-accent-red/50 transition-colors cursor-pointer min-h-[36px]"
                    onClick={handleDisconnectFolder}
                    disabled={switching()}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </Show>

            {/* Prompt to pick folder */}
            <Show when={settings().activeStorageProvider === "filesystem" && !fsFolderName()}>
              <div class="flex items-center justify-between p-3 rounded-md border border-accent-amber/30 bg-accent-amber/5">
                <span class="text-xs font-mono text-accent-amber/80">No folder selected</span>
                <button
                  class="px-3 py-1.5 rounded-md text-xs font-mono border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors cursor-pointer min-h-[36px]"
                  onClick={handlePickFolder}
                  disabled={switching()}
                >
                  Choose Folder
                </button>
              </div>
            </Show>

            {/* Ephemeral warning */}
            <Show when={settings().activeStorageProvider === "ephemeral"}>
              <div class="p-3 rounded-md border border-accent-amber/30 bg-accent-amber/5 text-xs font-mono text-accent-amber/80 leading-relaxed">
                Recordings will only exist in memory and are lost when you close the tab. Existing local recordings remain accessible.
              </div>
            </Show>

            {/* Switch error */}
            <Show when={switchWarning()}>
              <div class="p-3 rounded-md border border-accent-red/30 bg-accent-red/5 text-xs font-mono text-accent-red/80">
                {switchWarning()}
              </div>
            </Show>
          </SettingsCard>

          {/* Usage card — only meaningful for OPFS */}
          <Show when={settings().activeStorageProvider === "opfs" && quota()}>
            {(q) => {
              const pct = q().usagePercent;
              const barColor =
                pct >= 90 ? "bg-accent-red"
                : pct >= 75 ? "bg-accent-amber"
                : "bg-accent-cyan";
              return (
                <SettingsCard label="Usage">
                  <div class="flex items-center justify-between text-xs font-mono text-text-secondary">
                    <span>Storage Used</span>
                    <span class="text-text-primary">
                      {formatBytes(q().usageBytes)} / {formatBytes(q().quotaBytes)}
                    </span>
                  </div>
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
                    <span class={q().persisted ? "text-accent-green/70 text-xs" : "text-accent-amber/70 text-xs"}>
                      {q().persisted ? "Persistent" : "Not persistent"}
                    </span>
                  </div>
                  <Show when={pct >= 80}>
                    <div class="p-2 rounded border border-accent-amber/30 bg-accent-amber/5 text-xs font-mono text-accent-amber/80">
                      Storage is running low. Consider downloading or deleting older recordings.
                    </div>
                  </Show>
                </SettingsCard>
              );
            }}
          </Show>
        </div>
      </Show>

      {/* ─── Recording Tab ─── */}
      <Show when={activeTab() === "recording"}>
        <div id="panel-recording" role="tabpanel" class="flex flex-col gap-4">
          {/* Video Output card */}
          <SettingsCard label="Video Output">
            <SettingRow>
              <label for="default-template" class="text-sm text-text-primary">Template</label>
              <select
                id="default-template"
                class={selectClass}
                value={settings().defaultTemplateId}
                onChange={(e) => handleDefaultTemplate(e.currentTarget.value)}
              >
                <For each={templates}>
                  {(t) => <option value={t.id}>{t.name}</option>}
                </For>
              </select>
            </SettingRow>

            <SettingRow>
              <label for="video-quality" class="text-sm text-text-primary">Quality</label>
              <select
                id="video-quality"
                class={selectClass}
                value={settings().videoQuality}
                onChange={(e) => handleQualityChange(e.currentTarget.value as VideoQuality)}
              >
                <option value="low">Low (480p)</option>
                <option value="medium">Medium (720p)</option>
                <option value="high">High (1080p)</option>
              </select>
            </SettingRow>

            <SettingRow>
              <div class="flex flex-col min-w-0">
                <label for="recording-format" class="text-sm text-text-primary">Format</label>
                <span class="text-xs text-text-secondary/60 font-mono truncate">
                  {settings().recordingFormat === "av1"
                    ? "Best compression, needs modern GPU"
                    : settings().recordingFormat === "h264"
                      ? "Wide compatibility, larger files"
                      : "Legacy format, universal support"}
                </span>
              </div>
              <select
                id="recording-format"
                class={selectClass}
                value={settings().recordingFormat}
                onChange={(e) => handleFormatChange(e.currentTarget.value as RecordingFormat)}
              >
                <option value="av1">AV1 (MP4)</option>
                <option value="h264">H.264 (MP4)</option>
                <option value="webm">VP9 (WebM)</option>
              </select>
            </SettingRow>

            <SettingRow>
              <div class="flex flex-col min-w-0">
                <label for="recording-profile" class="text-sm text-text-primary">Profile</label>
                <span class="text-xs text-text-secondary/60 font-mono truncate">
                  {RECORDING_PROFILES[settings().recordingProfile].description}
                </span>
              </div>
              <select
                id="recording-profile"
                class={selectClass}
                value={settings().recordingProfile}
                onChange={(e) => handleProfileChange(e.currentTarget.value as RecordingProfile)}
              >
                <option value="standard">{RECORDING_PROFILES.standard.label}</option>
                <option value="efficient">{RECORDING_PROFILES.efficient.label}</option>
              </select>
            </SettingRow>

            {/* Size estimate — inline at bottom of card */}
            <div class="mt-1 p-2.5 rounded-md bg-bg-primary/50 border border-border-default/30">
              <div class="flex items-center justify-between text-xs font-mono">
                <span class="text-text-secondary/70">Est. max size</span>
                <span class="text-text-primary">~{estimatedSizePerMinute()} / min</span>
              </div>
              <Show when={settings().recordingFormat === "av1"}>
                <p class="text-[10px] font-mono text-text-secondary/50 mt-1">
                  AV1 typically produces 30-50% smaller files than estimated.
                </p>
              </Show>
            </div>
          </SettingsCard>

          {/* Behavior card */}
          <SettingsCard label="Behavior">
            <SettingRow>
              <label for="max-duration" class="text-sm text-text-primary">Max Duration</label>
              <select
                id="max-duration"
                class={selectClass}
                value={settings().maxDuration / 60}
                onChange={(e) => handleMaxDuration(parseInt(e.currentTarget.value))}
              >
                <option value="5">5 min</option>
                <option value="10">10 min</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
              </select>
            </SettingRow>

            <SettingRow border={false}>
              <label class="text-sm text-text-primary">Auto-generate Title</label>
              <Toggle
                checked={settings().autoGenerateTitle}
                onChange={handleAutoTitle}
                label="Auto-generate Title"
              />
            </SettingRow>
          </SettingsCard>
        </div>
      </Show>

      {/* ─── Cloud Tab ─── */}
      <Show when={activeTab() === "cloud"}>
        <div id="panel-cloud" role="tabpanel" class="flex flex-col gap-4">
          <Show
            when={cloudStore.isConnected()}
            fallback={
              <div class="flex flex-col gap-4">
                {/* Sign-in card */}
                <SettingsCard label="Google Drive">
                  <Show when={!googleAuth.getClientId()}>
                    <div class="p-2.5 rounded-md border border-accent-amber/30 bg-accent-amber/5 text-xs font-mono text-accent-amber/80 leading-relaxed">
                      OAuth Client ID required. Expand Developer Settings below to configure.
                    </div>
                  </Show>

                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span class="text-xs text-text-secondary/70 font-mono">
                      Back up videos to your Google Drive
                    </span>
                    <button
                      class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-mono border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] whitespace-nowrap"
                      disabled={!googleAuth.getClientId() || cloudStore.isConnecting()}
                      onClick={handleConnectDrive}
                    >
                      <Show when={cloudStore.isConnecting()} fallback={
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15.5 2H8.6c-.4 0-.8.2-1 .6L2.1 11.4c-.2.4-.2.8 0 1.2l5.5 9.2c.2.4.6.6 1 .6h6.8c.4 0 .8-.2 1-.6l5.5-9.2c.2-.4.2-.8 0-1.2L16.4 2.6c-.2-.4-.6-.6-.9-.6z" />
                          </svg>
                          Sign in with Google
                        </>
                      }>
                        <span class="animate-pulse">Connecting...</span>
                      </Show>
                    </button>
                  </div>

                </SettingsCard>

                {/* Developer Settings */}
                <div class="flex flex-col gap-2">
                  <button
                    class="flex items-center gap-1.5 text-xs font-mono text-text-secondary/50 hover:text-text-secondary transition-colors cursor-pointer self-start px-1"
                    onClick={() => setShowDevSettings((v) => !v)}
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                      class={`transition-transform ${showDevSettings() ? "rotate-90" : ""}`}
                    >
                      <path d="M3 1l4 4-4 4z" />
                    </svg>
                    Developer Settings
                  </button>
                  <Show when={showDevSettings()}>
                    <SettingsCard>
                      <label for="google-client-id" class="text-xs font-mono text-text-secondary uppercase tracking-wider">
                        Custom OAuth Client ID
                      </label>
                      <input
                        id="google-client-id"
                        type="text"
                        value={clientIdInput()}
                        onInput={(e) => setClientIdInput(e.currentTarget.value)}
                        placeholder="your-client-id.apps.googleusercontent.com"
                        class="bg-bg-primary border border-border-default rounded-md px-3 py-2 min-h-[44px] text-sm text-text-primary placeholder:text-text-secondary/40 font-mono focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30"
                      />
                      <p class="text-[10px] font-mono text-text-secondary/50 leading-relaxed">
                        Override the default Client ID. Create one at console.cloud.google.com with Drive API enabled.
                      </p>
                      <div class="flex items-center gap-2">
                        <button
                          class="px-3 py-1.5 rounded-md text-xs font-mono border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
                          disabled={!clientIdInput().trim()}
                          onClick={() => {
                            googleAuth.setClientId(clientIdInput().trim());
                          }}
                        >
                          Save
                        </button>
                        <Show when={googleAuth.hasCustomClientId()}>
                          <button
                            class="px-3 py-1.5 rounded-md text-xs font-mono border border-border-default text-text-secondary hover:text-text-primary transition-colors cursor-pointer min-h-[36px]"
                            onClick={() => {
                              googleAuth.clearClientId();
                              setClientIdInput("");
                            }}
                          >
                            Reset to default
                          </button>
                        </Show>
                      </div>
                    </SettingsCard>
                  </Show>
                </div>
              </div>
            }
          >
            {/* Connected state */}

            {/* Connection card */}
            <SettingsCard label="Google Drive">
              <div class="flex items-center justify-between gap-3">
                <div class="flex flex-col min-w-0">
                  <span class="text-xs font-mono text-accent-green/80">
                    Connected{cloudStore.userEmail() ? ` \u2014 ${cloudStore.userEmail()}` : ""}
                  </span>
                </div>
                <button
                  class="px-3 py-1.5 rounded-md text-xs font-mono border border-accent-red/30 text-accent-red/70 hover:text-accent-red hover:border-accent-red/50 transition-colors cursor-pointer shrink-0 min-h-[36px]"
                  onClick={handleDisconnectDrive}
                >
                  Disconnect
                </button>
              </div>
            </SettingsCard>

            {/* Sync controls card */}
            <SettingsCard label="Sync">
              <SettingRow>
                <div class="flex flex-col min-w-0">
                  <span class="text-sm text-text-primary">Auto-Sync</span>
                  <span class="text-xs text-text-secondary/60 font-mono">
                    Upload new recordings automatically
                  </span>
                </div>
                <Toggle
                  checked={cloudStore.isAutoSyncEnabled()}
                  onChange={() => cloudStore.toggleAutoSync()}
                  label="Auto-Sync"
                />
              </SettingRow>

              <SettingRow border={false}>
                <span class="text-xs font-mono text-text-secondary">
                  <Show when={cloudSyncManager.syncStatus() === "syncing"}>
                    <span class="text-accent-amber animate-pulse">
                      Syncing
                      <Show when={cloudSyncManager.syncProgress()}>
                        {" "}({cloudSyncManager.syncProgress()!.current}/{cloudSyncManager.syncProgress()!.total})
                      </Show>
                      ...
                    </span>
                  </Show>
                  <Show when={cloudSyncManager.syncStatus() === "idle"}>
                    <span class="text-text-secondary/60">
                      {cloudSyncManager.syncQueue().length > 0
                        ? `${cloudSyncManager.syncQueue().length} pending`
                        : "Up to date"}
                    </span>
                  </Show>
                  <Show when={cloudSyncManager.syncStatus() === "error"}>
                    <span class="text-accent-red">Sync error</span>
                  </Show>
                </span>
                <button
                  class="px-3 py-1.5 rounded text-xs font-mono border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors cursor-pointer disabled:opacity-50 min-h-[36px]"
                  disabled={cloudSyncManager.syncStatus() === "syncing"}
                  onClick={() => void cloudStore.syncNow()}
                >
                  Sync Now
                </button>
              </SettingRow>
            </SettingsCard>

            {/* Drive storage card */}
            <Show when={cloudQuota()}>
              {(cq) => {
                const pct = cq().usagePercent;
                const barColor =
                  pct >= 90 ? "bg-accent-red"
                  : pct >= 75 ? "bg-accent-amber"
                  : "bg-accent-cyan";
                return (
                  <SettingsCard label="Drive Storage">
                    <div class="flex items-center justify-between text-xs font-mono text-text-secondary">
                      <span>Used</span>
                      <span class="text-text-primary">
                        {formatBytes(cq().usageBytes)}
                        {cq().totalBytes > 0 ? ` / ${formatBytes(cq().totalBytes)}` : ""}
                      </span>
                    </div>
                    <Show when={cq().totalBytes > 0}>
                      <div class="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
                        <div
                          class={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span class={`text-[10px] font-mono ${pct >= 90 ? "text-accent-red" : "text-text-secondary/50"}`}>
                        {pct.toFixed(1)}% of Google Drive used
                      </span>
                    </Show>
                  </SettingsCard>
                );
              }}
            </Show>

          </Show>

          {/* Filesystem mode info — shown regardless of connection state */}
          <Show when={settings().activeStorageProvider === "filesystem"}>
            <div class="p-3 rounded-md border border-border-default bg-bg-elevated text-xs font-mono text-text-secondary/70 leading-relaxed">
              Cloud sync is not available for Filesystem mode. Use OS file sync tools (e.g. Google Drive desktop, Syncthing) to sync the folder.
            </div>
          </Show>
        </div>
      </Show>

      {/* ─── About Tab ─── */}
      <Show when={activeTab() === "about"}>
        <div id="panel-about" role="tabpanel" class="flex flex-col gap-4">
          <SettingsCard>
            <div class="flex flex-col gap-2 text-xs font-mono text-text-secondary">
              <span class="text-sm text-text-primary font-display tracking-wide">VidLog v0.1.0</span>
              <span>Built with SolidJS + Vite + Tailwind CSS</span>
              <span>Chrome/Edge recommended</span>
            </div>
          </SettingsCard>
        </div>
      </Show>
    </div>
  );
}
