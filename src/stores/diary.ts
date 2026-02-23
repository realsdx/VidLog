import { createSignal } from "solid-js";
import type { DiaryEntry } from "~/models/types";
import { storageManager } from "~/services/storage/manager";

const [entries, setEntries] = createSignal<DiaryEntry[]>([]);
const [activeEntry, setActiveEntry] = createSignal<DiaryEntry | null>(null);

export const diaryStore = {
  entries,
  activeEntry,
  setActiveEntry,

  /** Add a new entry and persist it */
  async addEntry(entry: DiaryEntry): Promise<void> {
    await storageManager.getProvider().save(entry);
    setEntries((prev) => [entry, ...prev]);
  },

  /** Update an existing entry */
  async updateEntry(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    await storageManager.getProvider().update(id, updates);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
    // Update active entry if it's the one being edited
    const active = activeEntry();
    if (active?.id === id) {
      setActiveEntry({ ...active, ...updates });
    }
  },

  /** Delete an entry */
  async deleteEntry(id: string): Promise<void> {
    const entry = entries().find((e) => e.id === id);
    if (entry?.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }
    await storageManager.getProvider().delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeEntry()?.id === id) {
      setActiveEntry(null);
    }
  },

  /** Load all entries from storage */
  async loadEntries(): Promise<void> {
    const all = await storageManager.getProvider().getAll();
    setEntries(all);
  },

  /** Get the next entry number for auto-title generation */
  getNextEntryNumber(): number {
    return entries().length + 1;
  },
};
