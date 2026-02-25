/**
 * Type declarations for File System Access API extensions.
 * These Chrome-specific APIs aren't in the default TypeScript lib.
 *
 * References:
 * - https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission
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
