import { createSignal, onCleanup } from "solid-js";
import Button from "~/components/ui/Button";
import { formatDuration } from "~/utils/time";
import { formatBlobSize, downloadBlob } from "~/utils/video";
import { toastStore } from "~/stores/toast";

interface PreviewPlayerProps {
  blob: Blob;
  duration: number;
  onDiscard: () => void;
  onSave: (title: string, tags: string[]) => void;
}

export default function PreviewPlayer(props: PreviewPlayerProps) {
  const [title, setTitle] = createSignal("");
  const [tagsInput, setTagsInput] = createSignal("");
  let videoRef: HTMLVideoElement | undefined;

  // Create blob URL once, revoke on cleanup to prevent memory leak
  const blobUrl = URL.createObjectURL(props.blob);
  onCleanup(() => URL.revokeObjectURL(blobUrl));

  function handleDownload() {
    const name = title() || "recording";
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadBlob(props.blob, `${safeName}.webm`);
    toastStore.success("Download started");
  }

  function handleSave() {
    const tags = tagsInput()
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    props.onSave(title(), tags);
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
          class="w-full max-h-[60vh] object-contain"
        />
      </div>

      {/* Metadata */}
      <div class="flex items-center gap-4 text-sm text-text-secondary font-mono">
        <span>Duration: {formatDuration(props.duration)}</span>
        <span>Size: {formatBlobSize(props.blob.size)}</span>
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
      <div class="flex items-center gap-3 pt-2">
        <Button variant="primary" onClick={handleSave}>
          Save to Library
        </Button>
        <Button variant="secondary" onClick={handleDownload}>
          Download
        </Button>
        <Button variant="danger" onClick={props.onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
