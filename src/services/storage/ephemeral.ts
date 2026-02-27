import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider, StorageCapabilities } from "./types";

/**
 * Ephemeral storage provider — stores entries in memory only.
 * Data is lost when the page is refreshed.
 */
export class EphemeralStorage implements IStorageProvider {
  readonly name = "ephemeral";
  readonly capabilities: StorageCapabilities = {
    persistent: false,
    lazyBlobs: false,
    quota: false,
    requiresPermission: false,
    userVisibleFiles: false,
  };

  private entries: Map<string, DiaryEntry> = new Map();

  async save(entry: DiaryEntry): Promise<void> {
    this.entries.set(entry.id, { ...entry });
  }

  async get(id: string): Promise<DiaryEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async getAll(): Promise<DiaryEntry[]> {
    return Array.from(this.entries.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async update(entry: DiaryEntry, updates: Partial<DiaryEntry>): Promise<void> {
    const existing = this.entries.get(entry.id);
    if (existing) {
      this.entries.set(entry.id, { ...existing, ...updates });
    }
  }

  async delete(entry: DiaryEntry): Promise<void> {
    const existing = this.entries.get(entry.id);
    if (existing?.videoBlobUrl) {
      URL.revokeObjectURL(existing.videoBlobUrl);
    }
    this.entries.delete(entry.id);
  }
}
