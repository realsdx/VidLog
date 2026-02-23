import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider } from "./types";
import { EphemeralStorage } from "./ephemeral";

/**
 * StorageManager — multi-provider storage with active provider for writes.
 *
 * - Reads merge entries from ALL registered providers (for the unified library view)
 * - Writes go to the active provider only
 * - Always registers EphemeralStorage by default
 */
class StorageManager {
  private activeProviderName: string;
  private providers: Map<string, IStorageProvider> = new Map();

  constructor() {
    // Ephemeral is always available
    const ephemeral = new EphemeralStorage();
    this.providers.set(ephemeral.name, ephemeral);
    this.activeProviderName = ephemeral.name;
  }

  /** Register a storage provider. If one with the same name exists, it's replaced. */
  registerProvider(provider: IStorageProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Get a provider by name */
  getProvider(name: string): IStorageProvider | undefined {
    return this.providers.get(name);
  }

  /** Get the active provider (used for new writes) */
  getActiveProvider(): IStorageProvider {
    const provider = this.providers.get(this.activeProviderName);
    if (!provider) {
      // Fallback to ephemeral if the active provider was removed
      return this.providers.get("ephemeral")!;
    }
    return provider;
  }

  /** Set which provider receives new writes */
  setActiveProvider(name: string): void {
    if (!this.providers.has(name)) {
      console.warn(
        `[StorageManager] Provider "${name}" not registered. Keeping "${this.activeProviderName}".`,
      );
      return;
    }
    this.activeProviderName = name;
  }

  /** Get the name of the currently active provider */
  getActiveProviderName(): string {
    return this.activeProviderName;
  }

  /** Get all registered provider names */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Load all entries from ALL registered providers, merged and sorted by createdAt desc.
   * This powers the unified library view.
   */
  async getAllEntries(): Promise<DiaryEntry[]> {
    const allEntries: DiaryEntry[] = [];

    for (const provider of this.providers.values()) {
      try {
        const entries = await provider.getAll();
        allEntries.push(...entries);
      } catch (err) {
        console.warn(
          `[StorageManager] Failed to load from "${provider.name}":`,
          err,
        );
      }
    }

    return allEntries.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Find the correct provider for an entry and delegate the operation.
   * Looks up by entry's storageProvider field, falling back to active provider.
   */
  getProviderForEntry(entry: DiaryEntry): IStorageProvider {
    return (
      this.providers.get(entry.storageProvider) ?? this.getActiveProvider()
    );
  }
}

export const storageManager = new StorageManager();
