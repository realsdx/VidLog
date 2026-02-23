import { createSignal } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { storageManager } from "~/services/storage/manager";

const [entries, setEntries] = createSignal<DiaryEntry[]>([]);
const [activeEntry, setActiveEntry] = createSignal<DiaryEntry | null>(null);

export const diaryStore = {
  entries,
  activeEntry,
  setActiveEntry,

  /** Add a new entry — writes to the active storage provider */
  async addEntry(entry: DiaryEntry): Promise<void> {
    await storageManager.getActiveProvider().save(entry);
    setEntries((prev) => [entry, ...prev]);
  },

  /** Update an existing entry — routes to the entry's own provider */
  async updateEntry(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    const entry = entries().find((e) => e.id === id);
    if (!entry) return;

    const provider = storageManager.getProviderForEntry(entry);
    await provider.update(id, updates);

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
    // Update active entry if it's the one being edited
    const active = activeEntry();
    if (active?.id === id) {
      setActiveEntry({ ...active, ...updates });
    }
  },

  /** Delete an entry — routes to the entry's own provider */
  async deleteEntry(id: string): Promise<void> {
    const entry = entries().find((e) => e.id === id);
    if (entry?.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }
    if (entry) {
      const provider = storageManager.getProviderForEntry(entry);
      await provider.delete(id);
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

  /** Get the next entry number for auto-title generation */
  getNextEntryNumber(): number {
    return entries().length + 1;
  },
};
