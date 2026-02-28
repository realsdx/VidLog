import { createSignal } from "solid-js";
import { cloudSyncManager } from "~/services/cloud/manager";
import { settingsStore } from "~/stores/settings";
import { toastStore } from "~/stores/toast";
import type {
  ICloudProvider,
  SyncStatus,
  SyncProgress,
  SyncQueueItem,
} from "~/services/cloud/types";

// ---------------------------------------------------------------------------
// Persistence — remember which cloud provider was connected
// ---------------------------------------------------------------------------

const CLOUD_STATE_KEY = "vidlog_cloud_state";

interface PersistedCloudState {
  /** Which provider is connected (null if none) */
  connectedProvider: string | null;
}

function loadCloudState(): PersistedCloudState {
  try {
    const raw = localStorage.getItem(CLOUD_STATE_KEY);
    if (raw) return JSON.parse(raw) as PersistedCloudState;
  } catch {
    // Corrupted data
  }
  return { connectedProvider: null };
}

function persistCloudState(state: PersistedCloudState): void {
  try {
    localStorage.setItem(CLOUD_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [isConnected, setIsConnected] = createSignal(false);
const [connectedProviderName, setConnectedProviderName] = createSignal<string | null>(
  loadCloudState().connectedProvider,
);
const [userEmail, setUserEmail] = createSignal<string | null>(null);
const [isConnecting, setIsConnecting] = createSignal(false);

// ---------------------------------------------------------------------------
// Cloud Store
// ---------------------------------------------------------------------------

export const cloudStore = {
  // -- Read-only signals ----------------------------------------------------
  isConnected,
  connectedProviderName,
  userEmail,
  isConnecting,

  /** Delegate to cloudSyncManager signals */
  get syncStatus(): () => SyncStatus {
    return cloudSyncManager.syncStatus;
  },
  get syncProgress(): () => SyncProgress | null {
    return cloudSyncManager.syncProgress;
  },
  get syncQueue(): () => SyncQueueItem[] {
    return cloudSyncManager.syncQueue;
  },
  get isAutoSyncEnabled(): () => boolean {
    return () => settingsStore.settings().cloudAutoSync;
  },

  // -- Actions --------------------------------------------------------------

  /**
   * Connect to a cloud provider.
   * Triggers the OAuth sign-in flow.
   */
  async connect(provider: ICloudProvider): Promise<void> {
    setIsConnecting(true);
    try {
      await provider.signIn();

      if (provider.isAuthenticated()) {
        cloudSyncManager.setProvider(provider);
        setIsConnected(true);
        setConnectedProviderName(provider.name);
        setUserEmail(provider.userDisplayName());
        persistCloudState({ connectedProvider: provider.name });

        // Enable sync if the user has auto-sync on
        if (settingsStore.settings().cloudAutoSync) {
          cloudSyncManager.enable();
        }

        toastStore.success("Connected to Google Drive");

        // Fetch cloud entries in background
        void cloudSyncManager.fetchCloudEntries();
      }
    } catch (err) {
      console.error("[cloudStore] Failed to connect:", err);
      const msg = err instanceof Error ? err.message : "Connection failed";
      toastStore.error(`Failed to connect: ${msg}`);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  },

  /**
   * Disconnect from the cloud provider.
   * Does NOT delete cloud files — just clears the local auth state.
   */
  async disconnect(): Promise<void> {
    const p = cloudSyncManager.provider();
    if (p) {
      try {
        await p.signOut();
      } catch {
        // Ignore sign-out errors — we're disconnecting anyway
      }
    }

    cloudSyncManager.clearProvider();
    setIsConnected(false);
    setConnectedProviderName(null);
    setUserEmail(null);
    persistCloudState({ connectedProvider: null });
    toastStore.info("Disconnected from cloud");
  },

  /**
   * Try to restore a previous cloud session on app boot.
   * @param provider The cloud provider to try restoring
   * @returns true if session was restored
   */
  async tryRestore(provider: ICloudProvider): Promise<boolean> {
    const state = loadCloudState();
    if (state.connectedProvider !== provider.name) return false;

    try {
      const restored = await provider.tryRestoreSession();
      if (restored) {
        cloudSyncManager.setProvider(provider);
        setIsConnected(true);
        setConnectedProviderName(provider.name);
        setUserEmail(provider.userDisplayName());

        if (settingsStore.settings().cloudAutoSync) {
          cloudSyncManager.enable();
        }

        return true;
      }
    } catch (err) {
      console.warn("[cloudStore] Failed to restore session:", err);
    }

    // Session couldn't be restored (token expired or missing).
    // Keep connectedProvider in localStorage so the UI can show a
    // "reconnect" prompt instead of acting like the user was never connected.
    return false;
  },

  /** Toggle auto-sync on/off. */
  toggleAutoSync(): void {
    const current = settingsStore.settings().cloudAutoSync;
    settingsStore.updateSettings({ cloudAutoSync: !current });
    if (!current) {
      cloudSyncManager.enable();
    } else {
      cloudSyncManager.disable();
    }
  },

  /** Force a full sync cycle now. */
  async syncNow(): Promise<void> {
    if (!isConnected()) {
      toastStore.warning("Not connected to cloud");
      return;
    }
    await cloudSyncManager.syncNow();
  },
};
