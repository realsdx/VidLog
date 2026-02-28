import { createSignal, onCleanup, Show } from "solid-js";
import Button from "~/components/ui/Button";
import StorageBadge from "~/components/ui/StorageBadge";
import { formatDuration } from "~/utils/time";
import { downloadBlob } from "~/utils/video";
import { formatBytes, getExtensionForMimeType } from "~/utils/format";
import { settingsStore } from "~/stores/settings";
import { toastStore } from "~/stores/toast";
import { cloudStore } from "~/stores/cloud";

interface PreviewPlayerProps {
  blob: Blob;
  duration: number;
  onDiscard: () => void;
  onSave: (title: string, tags: string[]) => void;
  onSaveAndUpload?: (title: string, tags: string[]) => Promise<void>;
}

export default function PreviewPlayer(props: PreviewPlayerProps) {
  const [title, setTitle] = createSignal("");
  const [tagsInput, setTagsInput] = createSignal("");
  const [isUploading, setIsUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal<number>(0);
  let videoRef: HTMLVideoElement | undefined;

  // Create blob URL once, revoke on cleanup to prevent memory leak
  const blobUrl = URL.createObjectURL(props.blob);
  onCleanup(() => URL.revokeObjectURL(blobUrl));

  const isEphemeral = () => settingsStore.settings().activeStorageProvider === "ephemeral";
  const canUploadToCloud = () => isEphemeral() && cloudStore.isConnected() && !!props.onSaveAndUpload;

  function handleDownload() {
    const name = title() || "recording";
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadBlob(props.blob, `${safeName}${getExtensionForMimeType(props.blob.type)}`);
    toastStore.success("Download started");
  }

  function handleSave() {
    const tags = tagsInput()
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    props.onSave(title(), tags);
  }

  /**
   * Save locally and upload to Google Drive.
   * Only available in ephemeral mode when connected to cloud.
   * Delegates to the parent via onSaveAndUpload prop.
   */
  async function handleUploadToCloud() {
    if (isUploading() || !props.onSaveAndUpload) return;

    setIsUploading(true);
    setUploadProgress(0);

    const tags = tagsInput()
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      await props.onSaveAndUpload(title(), tags);
    } catch {
      // Error toast is handled by the parent
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <div class="flex flex-col gap-4 w-full">
      {/* Video preview */}
      <div class="relative rounded-lg overflow-hidden border border-border-default bg-black">
        <video
          ref={videoRef}
          src={blobUrl}
          controls
          aria-label="Recording preview"
          class="w-full max-h-[60dvh] object-contain"
        />
      </div>

      {/* Metadata */}
      <div class="flex items-center gap-4 text-sm text-text-secondary font-mono">
        <span>Duration: {formatDuration(props.duration)}</span>
        <span>Size: {formatBytes(props.blob.size)}</span>
      </div>

      {/* Active storage destination */}
      <div class="flex items-center gap-2 text-xs font-mono text-text-secondary">
        <span>Saving to:</span>
        <StorageBadge provider={settingsStore.settings().activeStorageProvider} />
        <Show when={settingsStore.settings().activeStorageProvider === "ephemeral"}>
          <span class="text-accent-amber/70">— lost on tab close</span>
        </Show>
      </div>

      {/* Title input */}
      <div class="flex flex-col gap-1.5">
        <label for="preview-title" class="text-xs text-text-secondary font-mono uppercase tracking-wider">
          Title
        </label>
        <input
          id="preview-title"
          type="text"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="Enter a title for this log entry..."
          class="bg-bg-elevated border border-border-default rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30 transition-colors"
        />
      </div>

      {/* Tags input */}
      <div class="flex flex-col gap-1.5">
        <label for="preview-tags" class="text-xs text-text-secondary font-mono uppercase tracking-wider">
          Tags (comma separated)
        </label>
        <input
          id="preview-tags"
          type="text"
          value={tagsInput()}
          onInput={(e) => setTagsInput(e.currentTarget.value)}
          placeholder="personal, day-1, mission..."
          class="bg-bg-elevated border border-border-default rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-cyan/60 focus:ring-2 focus:ring-accent-cyan/30 transition-colors"
        />
      </div>

      {/* Action buttons */}
      <div class="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="primary" onClick={handleSave}>
          Save to Library
        </Button>
        <Button variant="secondary" onClick={handleDownload}>
          Download
        </Button>
        <Show when={canUploadToCloud()}>
          <Button
            variant="secondary"
            onClick={handleUploadToCloud}
            disabled={isUploading()}
          >
            <Show when={isUploading()} fallback="Upload to Drive">
              Uploading... {uploadProgress()}%
            </Show>
          </Button>
        </Show>
        <Button variant="danger" onClick={props.onDiscard}>
          Discard
        </Button>
      </div>

      {/* Ephemeral cloud hint */}
      <Show when={isEphemeral() && !cloudStore.isConnected()}>
        <p class="text-xs font-mono text-text-secondary/50">
          Connect to Google Drive in Settings to upload recordings to the cloud
        </p>
      </Show>
    </div>
  );
}
