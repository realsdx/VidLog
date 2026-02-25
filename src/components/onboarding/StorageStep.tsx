import { createSignal, Show } from "solid-js";
import type { StorageProviderType } from "~/models/types";
import { isOPFSAvailable } from "~/services/storage/opfs";
import { isFilesystemAvailable } from "~/services/storage/filesystem";
import { activateFilesystem } from "~/services/init";

interface StorageStepProps {
  onComplete: (choice: StorageProviderType) => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function StorageStep(props: StorageStepProps) {
  const opfsAvailable = isOPFSAvailable();
  const fsAvailable = isFilesystemAvailable();
  const [selected, setSelected] = createSignal<StorageProviderType>(
    opfsAvailable ? "opfs" : "ephemeral",
  );
  const [fsError, setFsError] = createSignal<string | null>(null);
  const [fsFolder, setFsFolder] = createSignal<string | null>(null);
  const [activating, setActivating] = createSignal(false);

  async function handlePickFolder() {
    setFsError(null);
    try {
      const handle = await window.showDirectoryPicker({
        id: "videodiary-vault",
        mode: "readwrite",
        startIn: "documents",
      });
      setFsFolder(handle.name);

      // Activate immediately — stores handle in IndexedDB and registers provider
      setActivating(true);
      const ok = await activateFilesystem(handle);
      setActivating(false);
      if (!ok) {
        setFsError("Failed to initialize folder. Try again.");
        setFsFolder(null);
        return;
      }
      setSelected("filesystem");
    } catch (err) {
      // User cancelled the picker or permission denied
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — no error
        return;
      }
      setFsError("Could not access the selected folder.");
    }
  }

  function handleComplete() {
    props.onComplete(selected());
  }

  return (
    <div class="flex flex-col items-center justify-center text-center gap-6 max-w-lg">
      <h2 class="font-display font-bold text-xl tracking-wider text-text-primary">
        STORAGE
      </h2>
      <p class="text-text-secondary text-sm">
        Where should your recordings be stored?
      </p>

      {/* Options */}
      <div class="flex flex-col gap-3 w-full">
        {/* OPFS option */}
        <button
          class={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
            selected() === "opfs"
              ? "border-accent-cyan/60 bg-accent-cyan/5"
              : "border-border-default bg-bg-secondary hover:border-border-default/80"
          } ${!opfsAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
          onClick={() => opfsAvailable && setSelected("opfs")}
          disabled={!opfsAvailable}
        >
          <div class="flex items-start gap-3">
            <div
              class={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected() === "opfs"
                  ? "border-accent-cyan"
                  : "border-text-secondary/40"
              }`}
            >
              {selected() === "opfs" && (
                <div class="w-2 h-2 rounded-full bg-accent-cyan" />
              )}
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-text-primary">
                Local Storage (OPFS)
                {!opfsAvailable && (
                  <span class="text-accent-amber text-xs ml-2">
                    Not available in this browser
                  </span>
                )}
              </span>
              <span class="text-xs text-text-secondary font-mono">
                Recordings persist on your device across sessions. Best
                experience. Data stays on YOUR machine.
              </span>
            </div>
          </div>
        </button>

        {/* Filesystem option */}
        <button
          class={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
            selected() === "filesystem"
              ? "border-accent-cyan/60 bg-accent-cyan/5"
              : "border-border-default bg-bg-secondary hover:border-border-default/80"
          } ${!fsAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
          onClick={() => fsAvailable && !fsFolder() && handlePickFolder()}
          disabled={!fsAvailable || activating()}
        >
          <div class="flex items-start gap-3">
            <div
              class={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected() === "filesystem"
                  ? "border-accent-cyan"
                  : "border-text-secondary/40"
              }`}
            >
              {selected() === "filesystem" && (
                <div class="w-2 h-2 rounded-full bg-accent-cyan" />
              )}
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-text-primary">
                Filesystem Folder
                {!fsAvailable && (
                  <span class="text-accent-amber text-xs ml-2">
                    Not available in this browser
                  </span>
                )}
              </span>
              <span class="text-xs text-text-secondary font-mono">
                Save to a visible folder on your computer. Files can be synced
                with Dropbox, backed up, or browsed in your file manager.
              </span>
              <Show when={fsFolder()}>
                <span class="text-xs text-accent-cyan font-mono mt-1">
                  Folder: {fsFolder()}
                </span>
              </Show>
              <Show when={fsAvailable && !fsFolder()}>
                <span class="text-xs text-text-secondary/60 font-mono mt-1">
                  Click to choose a folder
                </span>
              </Show>
            </div>
          </div>
        </button>

        {/* Filesystem error */}
        <Show when={fsError()}>
          <div class="p-2 rounded-md border border-accent-red/30 bg-accent-red/5 text-xs font-mono text-accent-red/80">
            {fsError()}
          </div>
        </Show>

        {/* Ephemeral option */}
        <button
          class={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
            selected() === "ephemeral"
              ? "border-accent-cyan/60 bg-accent-cyan/5"
              : "border-border-default bg-bg-secondary hover:border-border-default/80"
          }`}
          onClick={() => setSelected("ephemeral")}
        >
          <div class="flex items-start gap-3">
            <div
              class={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected() === "ephemeral"
                  ? "border-accent-cyan"
                  : "border-text-secondary/40"
              }`}
            >
              {selected() === "ephemeral" && (
                <div class="w-2 h-2 rounded-full bg-accent-cyan" />
              )}
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-text-primary">
                In-Memory
              </span>
              <span class="text-xs text-text-secondary font-mono">
                Recordings exist only while the tab is open. Lost on refresh.
                Good for quick tryouts.
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Info note */}
      <p class="text-[11px] text-text-secondary/60 font-mono">
        You can change this anytime in Settings.
      </p>

      {/* Actions */}
      <div class="flex items-center gap-4">
        <button
          class="px-6 py-2.5 rounded-md text-text-secondary text-sm font-mono hover:text-text-primary transition-colors cursor-pointer"
          onClick={props.onBack}
        >
          Back
        </button>
        <button
          class="px-8 py-2.5 rounded-md bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan font-mono text-sm font-medium hover:bg-accent-cyan/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleComplete}
          disabled={activating() || (selected() === "filesystem" && !fsFolder())}
        >
          {activating() ? "Setting up..." : "Get Started"}
        </button>
        <button
          class="px-6 py-2.5 rounded-md text-text-secondary text-sm font-mono hover:text-text-primary transition-colors cursor-pointer"
          onClick={props.onSkip}
        >
          Skip
        </button>
      </div>

      {/* Step indicator */}
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-border-default" />
        <div class="w-2 h-2 rounded-full bg-accent-cyan" />
      </div>
    </div>
  );
}
