/**
 * Type declarations for File System Access API extensions.
 * These Chrome-specific APIs aren't in the default TypeScript lib.
 *
 * References:
 * - https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver
 */

interface FileSystemPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemDirectoryHandle {
  queryPermission(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<PermissionState>;
}

interface ShowDirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | FileSystemHandle;
}

interface Window {
  showDirectoryPicker(
    options?: ShowDirectoryPickerOptions,
  ): Promise<FileSystemDirectoryHandle>;
}

// ---------------------------------------------------------------------------
// FileSystemObserver — experimental Chrome API for watching file changes
// https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver
// ---------------------------------------------------------------------------

/** The type of change that occurred on a file or directory. */
type FileSystemChangeType =
  | "appeared"
  | "disappeared"
  | "modified"
  | "moved"
  | "unknown"
  | "errored";

/** A single change record emitted by a FileSystemObserver. */
interface FileSystemChangeRecord {
  /** The handle that was passed to observe(). */
  readonly root: FileSystemHandle;
  /** The handle of the changed file/directory, or null for some change types. */
  readonly changedHandle: FileSystemHandle | null;
  /** Path components from the observed root to the changed entry. */
  readonly relativePathComponents: readonly string[];
  /** What kind of change occurred. */
  readonly type: FileSystemChangeType;
  /** Previous path components (only present when type === "moved"). */
  readonly relativePathMovedFrom?: readonly string[];
}

/** Callback signature for FileSystemObserver. */
type FileSystemObserverCallback = (
  records: FileSystemChangeRecord[],
  observer: FileSystemObserver,
) => void;

/** Options for FileSystemObserver.observe(). */
interface FileSystemObserverObserveOptions {
  recursive?: boolean;
}

/**
 * FileSystemObserver — watches files and directories for changes.
 * Experimental: Chrome only (behind flag or origin trial as of 2025).
 */
declare class FileSystemObserver {
  constructor(callback: FileSystemObserverCallback);
  observe(
    handle: FileSystemHandle,
    options?: FileSystemObserverObserveOptions,
  ): Promise<void>;
  unobserve(handle: FileSystemHandle): void;
  disconnect(): void;
}
