import { createSignal } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { storageManager } from "~/services/storage/manager";
import { cloudSyncManager } from "~/services/cloud/manager";
import { settingsStore } from "~/stores/settings";
import { OPFSStorage } from "~/services/storage/opfs";

const [entries, setEntries] = createSignal<DiaryEntry[]>([]);
const [activeEntry, setActiveEntry] = createSignal<DiaryEntry | null>(null);

export const diaryStore = {
  entries,
  activeEntry,
  setActiveEntry,

  /** Add a new entry — writes to the active storage provider */
  async addEntry(entry: DiaryEntry): Promise<void> {
    await storageManager.save(entry);
    setEntries((prev) => [entry, ...prev]);

    // Queue for cloud sync if:
    // 1. Cloud provider is connected
    // 2. Auto-sync is enabled
    // 3. The entry is stored in OPFS (not filesystem, not ephemeral for auto-sync)
    if (
      cloudSyncManager.provider()?.isAuthenticated() &&
      settingsStore.settings().cloudAutoSync &&
      entry.storageProvider === "opfs"
    ) {
      cloudSyncManager.queueUpload(entry.id);
    }
  },

  /** Update an existing entry — routes to the entry's own provider */
  async updateEntry(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    const entry = entries().find((e) => e.id === id);
    if (!entry) return;

    const withTimestamp = { ...updates, updatedAt: Date.now() };
    await storageManager.update(entry, withTimestamp);

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...withTimestamp } : e)),
    );
    // Update active entry if it's the one being edited
    const active = activeEntry();
    if (active?.id === id) {
      setActiveEntry({ ...active, ...withTimestamp });
    }
  },

  /** Delete an entry — routes to the entry's own provider */
  async deleteEntry(id: string): Promise<void> {
    const entry = entries().find((e) => e.id === id);
    if (entry?.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }
    if (entry) {
      await storageManager.deleteEntry(entry);
      // Remove from cloud sync queue if pending
      cloudSyncManager.dequeueUpload(id);
      // Delete cloud files if entry was synced or cloud-only
      if (entry.cloudSync?.videoFileRef || entry.cloudSync?.metaFileRef) {
        void cloudSyncManager.deleteCloudFiles(entry);
      }
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeEntry()?.id === id) {
      setActiveEntry(null);
    }
  },

  /** Load all entries from ALL registered storage providers (merged view) */
  async loadEntries(): Promise<void> {
    const all = await storageManager.getAllEntries();
    setEntries(all);
  },

  /**
   * Delete all OPFS-stored entries in bulk.
   * Uses OPFSStorage.clearAll() for efficient bulk deletion.
   * Non-OPFS entries (filesystem, ephemeral) are not affected.
   */
  async clearOPFSEntries(): Promise<void> {
    const current = entries();
    const opfsEntries = current.filter((e) => e.storageProvider === "opfs");

    // 1. Revoke in-memory blob URLs for OPFS entries
    for (const entry of opfsEntries) {
      if (entry.videoBlobUrl) {
        URL.revokeObjectURL(entry.videoBlobUrl);
      }
    }

    // 2. Bulk-clear OPFS files
    const opfsProvider = storageManager.getProvider("opfs");
    if (opfsProvider instanceof OPFSStorage) {
      await opfsProvider.clearAll();
    }

    // 3. Clean up cloud sync state for OPFS entries (sequential to avoid rate limits)
    for (const entry of opfsEntries) {
      cloudSyncManager.dequeueUpload(entry.id);
      if (entry.cloudSync?.videoFileRef || entry.cloudSync?.metaFileRef) {
        try {
          await cloudSyncManager.deleteCloudFiles(entry);
        } catch {
          // Best-effort — cloud copy may remain
        }
      }
    }

    // 4. Notify other tabs and update signal (keep non-OPFS entries)
    storageManager.notifyChange();
    setEntries((prev) => prev.filter((e) => e.storageProvider !== "opfs"));
    if (activeEntry()?.storageProvider === "opfs") {
      setActiveEntry(null);
    }
  },

  /** Get the next entry number for auto-title generation */
  getNextEntryNumber(): number {
    return entries().length + 1;
  },
};
