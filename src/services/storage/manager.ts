import type { IStorageProvider } from "./types";
import { EphemeralStorage } from "./ephemeral";

/**
 * StorageManager — strategy pattern for swappable storage providers.
 * Defaults to ephemeral (in-memory) storage.
 */
class StorageManager {
  private provider: IStorageProvider;

  constructor() {
    this.provider = new EphemeralStorage();
  }

  getProvider(): IStorageProvider {
    return this.provider;
  }

  setProvider(provider: IStorageProvider): void {
    this.provider = provider;
  }
}

export const storageManager = new StorageManager();
