import { settingsStore } from "~/stores/settings";
import { diaryStore } from "~/stores/diary";
import { storageManager } from "~/services/storage/manager";
import {
  ephemeralFactory,
  opfsFactory,
  filesystemFactory,
  type ProviderFactory,
} from "~/services/storage/registry";
import { FilesystemStorage } from "~/services/storage/filesystem";
import { storeDirectoryHandle } from "~/services/storage/handle-store";

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
      }
      continue;
    }

    try {
      const provider = await factory.create();
      if (provider) {
        storageManager.registerProvider(provider);
      } else if (factory.name === activeProvider) {
        // Factory returned null (e.g. filesystem with no stored handle)
        console.warn(
          `[init] Provider "${factory.name}" could not be created`,
        );
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
      }
    } catch (err) {
      console.warn(`[init] Failed to create provider "${factory.name}":`, err);
      if (factory.name === activeProvider) {
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
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
    return true;
  } catch (err) {
    console.warn("[init] Failed to activate filesystem:", err);
    return false;
  }
}
