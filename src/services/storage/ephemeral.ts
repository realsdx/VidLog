import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider } from "./types";

/**
 * Ephemeral storage provider — stores entries in memory only.
 * Data is lost when the page is refreshed.
 */
export class EphemeralStorage implements IStorageProvider {
  readonly name = "ephemeral";
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

  async update(id: string, updates: Partial<DiaryEntry>): Promise<void> {
    const existing = this.entries.get(id);
    if (existing) {
      this.entries.set(id, { ...existing, ...updates });
    }
  }

  async delete(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry?.videoBlobUrl) {
      URL.revokeObjectURL(entry.videoBlobUrl);
    }
    this.entries.delete(id);
  }
}
