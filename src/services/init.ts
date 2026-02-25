import { settingsStore } from "~/stores/settings";
import { diaryStore } from "~/stores/diary";
import { toastStore } from "~/stores/toast";
import { storageManager } from "~/services/storage/manager";
import {
  ephemeralFactory,
  opfsFactory,
  filesystemFactory,
  type ProviderFactory,
} from "~/services/storage/registry";
import { FilesystemStorage } from "~/services/storage/filesystem";
import { storeDirectoryHandle } from "~/services/storage/handle-store";
import type { ChangeSummary } from "~/services/storage/types";

/**
 * All provider factories, explicitly imported.
 * Order matters: ephemeral is skipped (always registered in StorageManager constructor),
 * remaining factories are tried in order.
 *
 * When adding a new provider (e.g. filesystem), add its factory here.
 */
const factories: ProviderFactory[] = [ephemeralFactory, opfsFactory, filesystemFactory];

/**
 * Initialize storage providers and load entries.
 * Called after onboarding is complete (or on returning visits).
 *
 * Boot sequence:
 * 1. Read activeStorageProvider from settings (already loaded from localStorage)
 * 2. Register all available providers via their factories
 * 3. Set the active provider on the manager (fall back to ephemeral if chosen one failed)
 * 4. Wire cross-tab sync callback
 * 5. Load all entries from all registered providers
 */
export async function initializeApp(): Promise<void> {
  const activeProvider = settingsStore.settings().activeStorageProvider;

  // Register all available providers via factories
  for (const factory of factories) {
    // Ephemeral is already registered in StorageManager constructor
    if (factory.name === "ephemeral") continue;

    if (!factory.isAvailable()) {
      // If this was the active provider, fall back
      if (factory.name === activeProvider) {
        console.warn(
          `[init] Provider "${factory.name}" not available in this browser`,
        );
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
        settingsStore.setStorageFallbackReason("unavailable");
      }
      continue;
    }

    try {
      const provider = await factory.create();
      if (provider) {
        storageManager.registerProvider(provider);
      } else if (factory.name === activeProvider) {
        // Factory returned null (e.g. filesystem permission denied or no handle)
        console.warn(
          `[init] Provider "${factory.name}" could not be created`,
        );
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
        settingsStore.setStorageFallbackReason(
          factory.name === "filesystem" ? "permission-denied" : "init-failed",
        );
      }
    } catch (err) {
      console.warn(`[init] Failed to create provider "${factory.name}":`, err);
      if (factory.name === activeProvider) {
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
        settingsStore.setStorageFallbackReason("init-failed");
      }
    }
  }

  // Set the active provider for writes
  const resolvedProvider = settingsStore.settings().activeStorageProvider;
  if (storageManager.getProvider(resolvedProvider)) {
    storageManager.setActiveProvider(resolvedProvider);
  } else {
    storageManager.setActiveProvider("ephemeral");
    settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
  }

  // Wire cross-tab sync: when another tab modifies entries, reload
  storageManager.setOnEntriesChanged(() => {
    void diaryStore.loadEntries();
  });

  // Start filesystem observer if the provider is registered
  startFilesystemObserver();

  // Load entries from ALL registered providers
  await diaryStore.loadEntries();
}

/**
 * Register and activate OPFS provider dynamically (e.g. when switching in Settings).
 * Returns true if successful.
 */
export async function activateOPFS(): Promise<boolean> {
  if (!opfsFactory.isAvailable()) return false;

  // Check if already registered
  if (storageManager.getProvider("opfs")) {
    storageManager.setActiveProvider("opfs");
    return true;
  }

  try {
    const provider = await opfsFactory.create();
    if (provider) {
      storageManager.registerProvider(provider);
      storageManager.setActiveProvider("opfs");
      return true;
    }
    return false;
  } catch (err) {
    console.warn("[init] Failed to activate OPFS:", err);
    return false;
  }
}

/**
 * Register and activate Filesystem provider dynamically.
 * Called from onboarding/settings after the user picks a folder via showDirectoryPicker().
 *
 * @param handle — The FileSystemDirectoryHandle returned by showDirectoryPicker()
 * @returns true if successful
 */
export async function activateFilesystem(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    // Persist handle in IndexedDB for future sessions
    await storeDirectoryHandle(handle);

    // Create and init the provider
    const fs = new FilesystemStorage(handle);
    await fs.init();

    storageManager.registerProvider(fs);
    storageManager.setActiveProvider("filesystem");

    // Start observing for external changes on the new provider
    startFilesystemObserver();

    return true;
  } catch (err) {
    console.warn("[init] Failed to activate filesystem:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Filesystem Observer — detect external file changes
// ---------------------------------------------------------------------------

/**
 * If a FilesystemStorage provider is registered and supports observation,
 * start watching for external changes and show a toast + reload on change.
 *
 * Safe to call multiple times — stops any existing observer first.
 */
function startFilesystemObserver(): void {
  const provider = storageManager.getProvider("filesystem");
  if (!provider || !provider.startObserving) return;

  // Stop any previous observer (e.g. when switching folders)
  provider.stopObserving?.();

  provider.startObserving((summary: ChangeSummary) => {
    // Reload the library from disk
    void diaryStore.loadEntries();

    // Build a human-readable toast message
    const message = formatChangeSummary(summary);
    if (message) {
      toastStore.info(message, 4000);
    }
  });
}

/** Format a ChangeSummary into a concise toast message. */
function formatChangeSummary(summary: ChangeSummary): string | null {
  const parts: string[] = [];

  if (summary.added > 0) {
    parts.push(`${summary.added} ${summary.added === 1 ? "entry" : "entries"} added`);
  }
  if (summary.removed > 0) {
    parts.push(`${summary.removed} ${summary.removed === 1 ? "entry" : "entries"} removed`);
  }
  if (summary.modified > 0 && summary.added === 0 && summary.removed === 0) {
    // Only show "modified" if nothing was added/removed (otherwise it's noise)
    parts.push(`${summary.modified === 1 ? "an entry" : "entries"} modified`);
  }

  if (parts.length === 0) return null;
  return parts.join(", ") + " from folder";
}
