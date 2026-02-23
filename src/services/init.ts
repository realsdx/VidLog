import { settingsStore } from "~/stores/settings";
import { diaryStore } from "~/stores/diary";
import { storageManager } from "~/services/storage/manager";
import { OPFSStorage, isOPFSAvailable } from "~/services/storage/opfs";

/**
 * Initialize storage providers and load entries.
 * Called after onboarding is complete (or on returning visits).
 *
 * Boot sequence:
 * 1. Read activeStorageProvider from settings (already loaded from localStorage)
 * 2. Always register OPFS if available (so existing OPFS entries are visible
 *    even when the active provider is ephemeral)
 * 3. Set the active provider on the manager
 * 4. Load all entries from all registered providers
 */
export async function initializeApp(): Promise<void> {
  const activeProvider = settingsStore.settings().activeStorageProvider;

  // Always register OPFS if the API is available.
  // This ensures OPFS entries remain visible in the library even when
  // the user has switched their active provider to ephemeral.
  if (isOPFSAvailable()) {
    try {
      const opfs = new OPFSStorage();
      await opfs.init();
      storageManager.registerProvider(opfs);
    } catch (err) {
      console.warn("[init] Failed to initialize OPFS:", err);
      // Fall back to ephemeral if OPFS was the active provider
      if (activeProvider === "opfs") {
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
      }
    }
  } else if (activeProvider === "opfs") {
    // OPFS not available but was selected — fall back
    console.warn("[init] OPFS not available in this browser");
    settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
  }

  // Set the active provider for writes
  const resolvedProvider = settingsStore.settings().activeStorageProvider;
  storageManager.setActiveProvider(resolvedProvider);

  // Load entries from ALL registered providers
  await diaryStore.loadEntries();
}

/**
 * Register and activate OPFS provider dynamically (e.g. when switching in Settings).
 * Returns true if successful.
 */
export async function activateOPFS(): Promise<boolean> {
  if (!isOPFSAvailable()) return false;

  // Check if already registered
  if (storageManager.getProvider("opfs")) {
    storageManager.setActiveProvider("opfs");
    return true;
  }

  try {
    const opfs = new OPFSStorage();
    await opfs.init();
    storageManager.registerProvider(opfs);
    storageManager.setActiveProvider("opfs");
    return true;
  } catch (err) {
    console.warn("[init] Failed to activate OPFS:", err);
    return false;
  }
}
