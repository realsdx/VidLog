import { Show, createSignal } from "solid-js";
import { settingsStore } from "~/stores/settings";
import { diaryStore } from "~/stores/diary";
import { activateFilesystem } from "~/services/init";
import { toastStore } from "~/stores/toast";

/**
 * Persistent banner shown when the app fell back to ephemeral storage because
 * the previously-chosen filesystem folder could not be accessed on boot
 * (permission denied, handle expired, etc.).
 *
 * Offers a "Reconnect" button that re-triggers the folder picker.
 */
export default function StorageRecoveryBanner() {
  const [reconnecting, setReconnecting] = createSignal(false);

  async function handleReconnect() {
    setReconnecting(true);
    try {
      const handle = await window.showDirectoryPicker({
        id: "vidlog-vault",
        mode: "readwrite",
        startIn: "videos",
      });

      const ok = await activateFilesystem(handle);
      if (ok) {
        settingsStore.updateSettings({ activeStorageProvider: "filesystem" });
        settingsStore.setStorageFallbackReason(null);
        await diaryStore.loadEntries();
        toastStore.success("Folder reconnected");
      } else {
        toastStore.error("Failed to initialize the selected folder");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled the picker — do nothing
      } else {
        toastStore.error("Could not access the selected folder");
      }
    } finally {
      setReconnecting(false);
    }
  }

  function handleDismiss() {
    settingsStore.setStorageFallbackReason(null);
  }

  const reason = () => settingsStore.storageFallbackReason();

  const message = (): string => {
    switch (reason()) {
      case "permission-denied":
        return "Folder access was denied. Your previous filesystem recordings are not visible.";
      case "unavailable":
        return "Your chosen storage provider is not supported in this browser.";
      case "init-failed":
        return "Failed to initialize your storage provider on startup.";
      default:
        return "Storage provider could not be loaded.";
    }
  };

  return (
    <Show when={reason()}>
      <div
        class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-accent-amber/30 bg-accent-amber/5"
        role="alert"
      >
        <div class="flex items-center gap-2 min-w-0">
          {/* Warning icon */}
          <svg
            class="shrink-0 w-4 h-4 text-accent-amber"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 1a1 1 0 0 1 .87.5l6.5 11.25A1 1 0 0 1 14.5 14h-13a1 1 0 0 1-.87-1.25L7.13 1.5A1 1 0 0 1 8 1Zm0 4.5a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 5.5ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
          </svg>
          <span class="text-xs font-mono text-accent-amber/90 truncate">
            {message()}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <Show when={reason() === "permission-denied"}>
            <button
              class="px-3 py-1 rounded-md text-xs font-mono font-medium border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleReconnect}
              disabled={reconnecting()}
            >
              {reconnecting() ? "Connecting..." : "Reconnect Folder"}
            </button>
          </Show>
          <button
            class="p-2 -m-1 rounded text-text-secondary/60 hover:text-text-primary transition-colors cursor-pointer"
            onClick={handleDismiss}
            aria-label="Dismiss storage warning"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  );
}
