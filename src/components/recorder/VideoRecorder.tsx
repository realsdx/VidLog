import { onMount, onCleanup, Show, createSignal } from "solid-js";
import { recorderStore } from "~/stores/recorder";
import { templateStore } from "~/stores/template";
import { diaryStore } from "~/stores/diary";
import { settingsStore } from "~/stores/settings";
import { requestCamera, stopStream } from "~/services/recorder/camera";
import { RecordingEngine } from "~/services/recorder/engine";
import { resolveRecordingParams } from "~/services/recorder/profiles";
import type { DiaryEntry } from "~/models/types";
import { generateId, generateFilesystemId } from "~/utils/id";
import { generateAutoTitle } from "~/utils/time";
import { generateThumbnail } from "~/utils/video";
import RecordingControls from "./RecordingControls";
import PreviewPlayer from "./PreviewPlayer";
import TemplatePicker from "~/components/templates/TemplatePicker";
import { toastStore } from "~/stores/toast";
import { getCameraErrorMessage } from "~/utils/compat";
import { getStorageQuota } from "~/services/storage/opfs";
import { cloudSyncManager } from "~/services/cloud/manager";
import { cloudStore } from "~/stores/cloud";
import type { UploadProgress } from "~/services/cloud/types";

export default function VideoRecorder() {
  let canvasRef: HTMLCanvasElement | undefined;
  let engine: RecordingEngine | null = null;
  const [recordedBlob, setRecordedBlob] = createSignal<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = createSignal(0);

  onMount(async () => {
    await initCamera();
  });

  onCleanup(() => {
    engine?.destroy();
    const stream = recorderStore.stream();
    if (stream) stopStream(stream);
  });

  async function initCamera() {
    try {
      recorderStore.setStatus("preparing");
      recorderStore.setError(null);

      // M11: Destroy old engine before creating a new one on retry
      if (engine) {
        engine.destroy();
        engine = null;
      }

      const params = resolveRecordingParams(
        settingsStore.settings().recordingProfile,
        settingsStore.getQuality(),
      );
      const stream = await requestCamera(
        recorderStore.selectedDeviceId() ?? undefined,
        { width: params.width, height: params.height },
      );
      recorderStore.setStream(stream);

      if (canvasRef) {
        engine = new RecordingEngine({
          canvas: canvasRef,
          stream,
          template: templateStore.activeTemplate(),
          title: "",
          videoBitsPerSecond: params.videoBitsPerSecond,
          audioBitsPerSecond: params.audioBitsPerSecond,
          frameRate: params.frameRate,
          preferredFormat: settingsStore.settings().recordingFormat,
          maxDuration: settingsStore.settings().maxDuration,
          onElapsedUpdate: (elapsed) => recorderStore.setElapsed(elapsed),
          onMaxDuration: () => handleStop(),
        });
        await engine.prepare();
      }

      recorderStore.setStatus("ready");
    } catch (err) {
      const msg = getCameraErrorMessage(err);
      recorderStore.setError(msg);
      recorderStore.setStatus("error");
      toastStore.error(msg);
    }
  }

  function handleStart() {
    // H4: Guard against double-click creating duplicate MediaRecorder
    if (!engine || recorderStore.status() === "recording") return;
    engine.setTemplate(templateStore.activeTemplate());

    const title = settingsStore.settings().autoGenerateTitle
      ? generateAutoTitle(diaryStore.getNextEntryNumber())
      : "";
    engine.setTitle(title);

    engine.start();
    recorderStore.setStatus("recording");
    recorderStore.setElapsed(0);

    // Notify if the browser couldn't use the preferred format
    const preferred = settingsStore.settings().recordingFormat;
    const negotiated = engine.getNegotiatedMimeType();
    const expectedContainer = preferred === "webm" ? "video/webm" : "video/mp4";
    if (!negotiated.startsWith(expectedContainer)) {
      const labels: Record<string, string> = { "video/mp4": "MP4", "video/webm": "WebM" };
      const got = negotiated.startsWith("video/mp4") ? labels["video/mp4"] : labels["video/webm"];
      toastStore.warning(
        `Your browser doesn't support ${preferred.toUpperCase()} recording. Falling back to ${got}.`,
      );
    }
  }

  async function handleStop() {
    if (!engine) return;
    // Capture elapsed BEFORE stopping (M1: stop() resets internal state)
    const duration = recorderStore.elapsed();
    const blob = await engine.stop();
    // Set signals BEFORE status change so UI has data when preview renders
    setRecordedBlob(blob);
    setRecordedDuration(duration);
    recorderStore.setStatus("stopped");
  }

  function handlePause() {
    engine?.pause();
    recorderStore.setStatus("paused");
  }

  function handleResume() {
    engine?.resume();
    recorderStore.setStatus("recording");
  }

  function handleDiscard() {
    setRecordedBlob(null);
    setRecordedDuration(0);
    recorderStore.reset();
    recorderStore.setStatus("ready");

    // Restart the canvas render loop so the live camera preview resumes
    engine?.resumePreview();
  }

  async function handleSave(title: string, tags: string[]) {
    const blob = recordedBlob();
    if (!blob) return;

    const autoTitle =
      title || generateAutoTitle(diaryStore.getNextEntryNumber());

    let thumbnailDataUrl: string | null = null;
    try {
      thumbnailDataUrl = await generateThumbnail(blob);
    } catch {
      // Thumbnail generation is optional
    }

    const activeProvider = settingsStore.settings().activeStorageProvider;
    const entry: DiaryEntry = {
      id: activeProvider === "filesystem" ? generateFilesystemId() : generateId(),
      title: autoTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duration: recordedDuration(),
      tags,
      templateId: templateStore.activeTemplate().id,
      storageProvider: activeProvider,
      mimeType: engine?.getNegotiatedMimeType() ?? (blob.type || "video/webm"),
      videoBlob: blob,
      videoBlobUrl: null, // H6: Created lazily on-demand when entry is opened
      thumbnailDataUrl,
      cloudStatus: "none",
      cloudProvider: null,
      cloudFileId: null,
      cloudUrl: null,
      cloudError: null,
    };

    // M8: Wrap persistence in try/catch
    try {
      await diaryStore.addEntry(entry);
      toastStore.success("Entry saved to library");
    } catch (err) {
      console.error("[VideoRecorder] Failed to save entry:", err);
      toastStore.error("Failed to save entry. Please try again.");
      return;
    }

    // Warn if storage is running low after save
    try {
      const quota = await getStorageQuota();
      if (quota && quota.usagePercent >= 80) {
        toastStore.warning(
          `Storage is ${quota.usagePercent.toFixed(0)}% full. Consider downloading or deleting older recordings.`,
        );
      }
    } catch {
      // Non-critical — don't block the save flow
    }

    handleDiscard();
  }

  /**
   * Save the recording locally (ephemeral) and upload to Google Drive.
   * Used only in ephemeral mode. Saves first so the entry exists in the
   * diary store, then does a one-shot cloud upload.
   */
  async function handleSaveAndUpload(title: string, tags: string[]) {
    const blob = recordedBlob();
    if (!blob) return;

    if (!cloudStore.isConnected()) {
      toastStore.error("Not connected to Google Drive");
      return;
    }

    const autoTitle =
      title || generateAutoTitle(diaryStore.getNextEntryNumber());

    let thumbnailDataUrl: string | null = null;
    try {
      thumbnailDataUrl = await generateThumbnail(blob);
    } catch {
      // Thumbnail generation is optional
    }

    const entry: DiaryEntry = {
      id: generateId(),
      title: autoTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duration: recordedDuration(),
      tags,
      templateId: templateStore.activeTemplate().id,
      storageProvider: "ephemeral",
      mimeType: engine?.getNegotiatedMimeType() ?? (blob.type || "video/webm"),
      videoBlob: blob,
      videoBlobUrl: null,
      thumbnailDataUrl,
      cloudStatus: "none",
      cloudProvider: null,
      cloudFileId: null,
      cloudUrl: null,
      cloudError: null,
    };

    // Save locally first
    try {
      await diaryStore.addEntry(entry);
    } catch (err) {
      console.error("[VideoRecorder] Failed to save entry:", err);
      toastStore.error("Failed to save entry. Please try again.");
      throw err;
    }

    // Upload to cloud
    try {
      await cloudSyncManager.uploadSingle(entry, (_progress: UploadProgress) => {
        // Progress is tracked in PreviewPlayer via its own signal
      });
      toastStore.success("Saved and uploaded to Google Drive");
    } catch (err) {
      console.error("[VideoRecorder] Cloud upload failed:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      toastStore.error(`Saved locally but cloud upload failed: ${msg}`);
      // Don't re-throw — the local save succeeded
    }

    handleDiscard();
  }

  function handleTemplateChange() {
    if (engine) {
      engine.setTemplate(templateStore.activeTemplate());
    }
  }

  return (
    <div class="flex flex-col items-center gap-4 w-full h-full">
      {/* Error state */}
      <Show when={recorderStore.error()}>
        <div class="w-full max-w-3xl p-4 rounded-lg border border-accent-red/40 bg-accent-red/10 text-accent-red text-sm">
          <p class="font-mono font-bold mb-1">Camera Error</p>
          <p>{recorderStore.error()}</p>
          <button
            class="mt-2 text-xs underline hover:no-underline cursor-pointer"
            onClick={initCamera}
          >
            Retry
          </button>
        </div>
      </Show>

      {/* Preview mode — show the recorded video */}
      <Show when={recorderStore.status() === "stopped" && recordedBlob()}>
        <div class="w-full max-w-3xl">
          <PreviewPlayer
            blob={recordedBlob()!}
            duration={recordedDuration()}
            onDiscard={handleDiscard}
            onSave={handleSave}
            onSaveAndUpload={handleSaveAndUpload}
          />
        </div>
      </Show>

      {/* Recording / ready mode — show the canvas */}
      {/* Recording / ready mode — canvas is always mounted, hidden when in preview */}
      <div class={recorderStore.status() === "stopped" ? "hidden" : ""}>
        {/* Canvas viewport */}
        <div class="relative w-full max-w-4xl rounded-lg overflow-hidden border border-border-default bg-black aspect-video">
          <Show when={recorderStore.status() === "preparing"}>
            <div class="absolute inset-0 flex items-center justify-center z-10">
              <p class="font-mono text-sm text-text-secondary animate-pulse">
                Initializing camera...
              </p>
            </div>
          </Show>

          {/* Recording border glow */}
          <Show when={recorderStore.status() === "recording"}>
            <div class="absolute inset-0 border-2 border-accent-red/50 rounded-lg pointer-events-none z-10 animate-pulse-rec" />
          </Show>

          <canvas
            ref={canvasRef}
            class="w-full h-auto block touch-manipulation"
            style={{ "max-height": "calc(100dvh - 220px)" }}
          />
        </div>

        {/* Controls bar */}
        <div class="flex flex-col-reverse sm:flex-row items-center justify-between w-full max-w-4xl gap-4 px-2 mt-4">
          {/* Template picker (only when not recording) */}
          <Show
            when={
              recorderStore.status() === "ready" ||
              recorderStore.status() === "idle"
            }
            fallback={<div />}
          >
            <TemplatePicker onSelect={handleTemplateChange} />
          </Show>

          <RecordingControls
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
          />
        </div>
      </div>
    </div>
  );
}
