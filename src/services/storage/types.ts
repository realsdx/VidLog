import type { DiaryEntry } from "~/models/types";

/**
 * Storage provider interface.
 * Implementations handle persisting diary entries and their video blobs.
 */
export interface IStorageProvider {
  readonly name: string;

  save(entry: DiaryEntry): Promise<void>;
  get(id: string): Promise<DiaryEntry | null>;
  getAll(): Promise<DiaryEntry[]>;
  update(id: string, updates: Partial<DiaryEntry>): Promise<void>;
  delete(id: string): Promise<void>;
}
