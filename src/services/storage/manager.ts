import type { DiaryEntry } from "~/models/types";
import type { IStorageProvider } from "./types";
import { EphemeralStorage } from "./ephemeral";

/**
 * StorageManager — multi-provider storage with active provider for writes.
 *
 * - Reads merge entries from ALL registered providers (for the unified library view)
 * - Writes go to the active provider only
 * - Always registers EphemeralStorage by default
 * - BroadcastChannel notifies other tabs when entries change
 */
class StorageManager {
  private activeProviderName: string;
  private providers: Map<string, IStorageProvider> = new Map();
  private channel: BroadcastChannel | null = null;
  private onEntriesChanged: (() => void) | null = null;

  constructor() {
    // Ephemeral is always available
    const ephemeral = new EphemeralStorage();
    this.providers.set(ephemeral.name, ephemeral);
    this.activeProviderName = ephemeral.name;

    // Set up cross-tab sync via BroadcastChannel
    try {
      this.channel = new BroadcastChannel("vidlog-sync");
      this.channel.onmessage = () => {
        this.onEntriesChanged?.();
      };
    } catch {
      // BroadcastChannel not available — cross-tab sync disabled
    }
  }

  /**
   * Register a callback to be called when another tab modifies entries.
   * Typically wired to diaryStore.loadEntries() during app init.
   */
  setOnEntriesChanged(callback: () => void): void {
    this.onEntriesChanged = callback;
  }

  /** Notify other tabs that entries have changed. */
  private notifyChange(): void {
    try {
      this.channel?.postMessage({ type: "entries-changed" });
    } catch {
      // Channel may be closed — ignore
    }
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

  /**
   * Lazy-load a video blob for an entry, delegating to the correct provider.
   * Returns null if the provider doesn't support lazy loading or the blob doesn't exist.
   */
  async loadVideoBlob(entry: DiaryEntry): Promise<Blob | null> {
    const provider = this.getProviderForEntry(entry);
    if (provider.loadVideoBlob) {
      return provider.loadVideoBlob(entry);
    }
    // Provider doesn't support lazy loading — blob should already be on the entry
    return entry.videoBlob;
  }

  /**
   * Save an entry via the active provider and notify other tabs.
   */
  async save(entry: DiaryEntry): Promise<void> {
    await this.getActiveProvider().save(entry);
    this.notifyChange();
  }

  /**
   * Update an entry via its own provider and notify other tabs.
   */
  async update(entry: DiaryEntry, updates: Partial<DiaryEntry>): Promise<void> {
    const provider = this.getProviderForEntry(entry);
    await provider.update(entry, updates);
    this.notifyChange();
  }

  /**
   * Delete an entry via its own provider and notify other tabs.
   */
  async deleteEntry(entry: DiaryEntry): Promise<void> {
    const provider = this.getProviderForEntry(entry);
    await provider.delete(entry);
    this.notifyChange();
  }
}

export const storageManager = new StorageManager();
