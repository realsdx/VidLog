import type { IStorageProvider } from "./types";
import { EphemeralStorage } from "./ephemeral";
import { OPFSStorage, isOPFSAvailable } from "./opfs";
import { FilesystemStorage, isFilesystemAvailable } from "./filesystem";
import { getStoredDirectoryHandle } from "./handle-store";

/**
 * A factory that can create and initialize a storage provider.
 * Each provider has one factory; all are explicitly imported in init.ts.
 */
export interface ProviderFactory {
  /** Provider name — must match a StorageProviderType value */
  readonly name: string;

  /** Can this provider potentially work in this browser? */
  isAvailable(): boolean;

  /** Attempt to create and initialize the provider. Returns null on failure. */
  create(): Promise<IStorageProvider | null>;
}

/** Ephemeral — always available, no init needed */
export const ephemeralFactory: ProviderFactory = {
  name: "ephemeral",
  isAvailable: () => true,
  create: async () => new EphemeralStorage(),
};

/** OPFS — available if the Origin Private File System API exists */
export const opfsFactory: ProviderFactory = {
  name: "opfs",
  isAvailable: () => isOPFSAvailable(),
  create: async () => {
    const opfs = new OPFSStorage();
    await opfs.init();
    return opfs;
  },
};

/**
 * Filesystem — available if the File System Access API exists.
 *
 * Boot sequence:
 * 1. Retrieve stored FileSystemDirectoryHandle from IndexedDB
 * 2. If no handle → return null (user never picked a folder)
 * 3. queryPermission({ mode: 'readwrite' })
 * 4. If 'granted' → proceed silently (persistent permission active)
 * 5. If 'prompt' → call requestPermission({ mode: 'readwrite' })
 * 6. If denied → return null (fall back handled by init.ts)
 */
export const filesystemFactory: ProviderFactory = {
  name: "filesystem",
  isAvailable: () => isFilesystemAvailable(),
  create: async () => {
    // 1. Retrieve handle from IndexedDB
    const handle = await getStoredDirectoryHandle();
    if (!handle) return null; // No folder selected yet

    // 2. Check permission
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      const fs = new FilesystemStorage(handle);
      await fs.init();
      return fs;
    }
    if (perm === "prompt") {
      const result = await handle.requestPermission({ mode: "readwrite" });
      if (result === "granted") {
        const fs = new FilesystemStorage(handle);
        await fs.init();
        return fs;
      }
    }

    // Permission denied or dismissed
    return null;
  },
};
