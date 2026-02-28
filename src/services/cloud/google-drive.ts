/**
 * Google Drive cloud provider implementation.
 *
 * Uses the Drive API v3 REST endpoints directly via fetch().
 * All files are stored in the hidden appDataFolder (scope: drive.appdata).
 *
 * File naming convention (appDataFolder is flat — no real subdirectories):
 * - Video:    `video_{entryId}.{ext}`   (appProperties.type = "video")
 * - Metadata: `entry_{entryId}.json`    (appProperties.type = "entry-meta")
 */

import { createSignal } from "solid-js";
import { googleAuth } from "./auth/google";
import type { DiaryEntryMeta } from "~/models/types";
import type {
  ICloudProvider,
  CloudFileRef,
  CloudQuota,
  UploadProgress,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** Extension map from MIME type */
function getExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "webm";
}

// ---------------------------------------------------------------------------
// Drive API Helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated fetch to the Drive API.
 * Handles token refresh on 401.
 */
async function driveFetch(
  url: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await googleAuth.getValidToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && retry) {
    // Token expired mid-request — refresh and retry once
    const newToken = await googleAuth.signIn();
    headers.set("Authorization", `Bearer ${newToken}`);
    return fetch(url, { ...options, headers });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Drive API error ${response.status}: ${response.statusText}. ${errorBody}`,
    );
  }

  return response;
}

/**
 * Find a file in appDataFolder by name and type.
 */
async function findFile(
  name: string,
  type: string,
): Promise<{ id: string; name: string } | null> {
  // Escape single quotes to prevent query injection if name/type ever contain them
  const safeName = name.replace(/'/g, "\\'");
  const safeType = type.replace(/'/g, "\\'");
  const query = `name='${safeName}' and appProperties has { key='type' and value='${safeType}' } and trashed=false`;
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: query,
    fields: "files(id,name)",
    pageSize: "1",
  });

  const res = await driveFetch(`${DRIVE_API}/files?${params}`);
  const data = await res.json();
  const files = data.files as Array<{ id: string; name: string }>;
  return files.length > 0 ? files[0] : null;
}

/**
 * Resumable upload to Google Drive.
 * 1. Initiate session → get upload URI
 * 2. Upload blob in chunks → track progress
 */
async function resumableUpload(
  fileName: string,
  blob: Blob,
  mimeType: string,
  appProperties: Record<string, string>,
  existingFileId: string | null,
  onProgress?: (progress: UploadProgress) => void,
  entryId?: string,
): Promise<string> {
  const token = await googleAuth.getValidToken();

  // Step 1: Initiate resumable upload session
  const metadata: Record<string, unknown> = {
    name: fileName,
    appProperties,
  };

  // If creating a new file, set parent to appDataFolder
  // If updating an existing file, use PATCH to the file ID
  let initUrl: string;
  let initMethod: string;

  if (existingFileId) {
    initUrl = `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=resumable`;
    initMethod = "PATCH";
  } else {
    metadata.parents = ["appDataFolder"];
    initUrl = `${DRIVE_UPLOAD_API}/files?uploadType=resumable`;
    initMethod = "POST";
  }

  const initRes = await fetch(initUrl, {
    method: initMethod,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": blob.size.toString(),
    },
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    const err = await initRes.text().catch(() => "");
    throw new Error(`Failed to initiate upload: ${initRes.status} ${err}`);
  }

  const sessionUri = initRes.headers.get("Location");
  if (!sessionUri) {
    throw new Error("No upload session URI returned");
  }

  // Step 2: Upload the blob
  // For simplicity, upload the entire blob in one request.
  // Google's resumable upload allows this for blobs of any size.
  // If we need chunked upload later, we can split here.
  const uploadRes = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": blob.size.toString(),
    },
    body: blob,
  });

  // Report progress as complete (fetch doesn't support upload progress natively
  // without XMLHttpRequest — we report 100% on completion)
  if (onProgress) {
    onProgress({
      entryId: entryId ?? "",
      bytesUploaded: blob.size,
      bytesTotal: blob.size,
      fraction: 1,
    });
  }

  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => "");
    throw new Error(`Upload failed: ${uploadRes.status} ${err}`);
  }

  const fileData = await uploadRes.json();
  return fileData.id as string;
}

/**
 * Simple upload for small files (< 5MB, like JSON metadata).
 */
async function simpleUpload(
  fileName: string,
  content: string,
  mimeType: string,
  appProperties: Record<string, string>,
  existingFileId: string | null,
): Promise<string> {
  const token = await googleAuth.getValidToken();

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType,
    appProperties,
  };

  if (!existingFileId) {
    metadata.parents = ["appDataFolder"];
  }

  // Multipart upload: metadata + content in one request
  const boundary = "vidlog_boundary_" + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;

  const method = existingFileId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Metadata upload failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Google Drive Provider
// ---------------------------------------------------------------------------

const [authenticated, setAuthenticated] = createSignal(false);
const [displayName, setDisplayName] = createSignal<string | null>(null);

export class GoogleDriveProvider implements ICloudProvider {
  readonly name = "google-drive" as const;

  get isAuthenticated() {
    return authenticated;
  }

  get userDisplayName() {
    return displayName;
  }

  // -- Auth -----------------------------------------------------------------

  async signIn(): Promise<void> {
    await googleAuth.signIn();
    setAuthenticated(true);
    setDisplayName(googleAuth.userEmail());

    // If email wasn't immediately available, wait a bit and retry
    if (!displayName()) {
      setTimeout(() => {
        setDisplayName(googleAuth.userEmail());
      }, 1000);
    }
  }

  async signOut(): Promise<void> {
    googleAuth.signOut();
    setAuthenticated(false);
    setDisplayName(null);
  }

  async tryRestoreSession(): Promise<boolean> {
    // GIS implicit flow can't silently restore tokens
    const restored = await googleAuth.tryRestoreSession();
    if (restored) {
      setAuthenticated(true);
      setDisplayName(googleAuth.userEmail());
    }
    return restored;
  }

  // -- Video operations -----------------------------------------------------

  async uploadVideo(
    entryId: string,
    blob: Blob,
    mimeType: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<CloudFileRef> {
    const ext = getExtension(mimeType);
    const fileName = `video_${entryId}.${ext}`;

    // Check if file already exists (update instead of create)
    const existing = await findFile(fileName, "video");

    const fileId = await resumableUpload(
      fileName,
      blob,
      mimeType,
      { type: "video", entryId },
      existing?.id ?? null,
      onProgress,
      entryId,
    );

    return {
      provider: "google-drive",
      fileId,
      mimeType,
    };
  }

  async downloadVideo(fileRef: CloudFileRef): Promise<Blob> {
    const res = await driveFetch(
      `${DRIVE_API}/files/${fileRef.fileId}?alt=media`,
    );
    return res.blob();
  }

  async getVideoStreamUrl(fileRef: CloudFileRef): Promise<string> {
    // Fetch the video as a blob using the Authorization header (secure),
    // then return a local object URL. This avoids leaking the access token
    // in a URL query parameter (which would be visible in browser history,
    // Referer headers, etc.).
    const res = await driveFetch(
      `${DRIVE_API}/files/${fileRef.fileId}?alt=media`,
    );
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  async deleteVideo(fileRef: CloudFileRef): Promise<void> {
    // appDataFolder files can't be trashed — must permanently delete
    await driveFetch(`${DRIVE_API}/files/${fileRef.fileId}`, {
      method: "DELETE",
    });
  }

  // -- Metadata operations --------------------------------------------------

  async uploadMeta(
    entryId: string,
    meta: DiaryEntryMeta,
  ): Promise<CloudFileRef> {
    const fileName = `entry_${entryId}.json`;
    const content = JSON.stringify(meta);

    // Check if metadata file already exists
    const existing = await findFile(fileName, "entry-meta");

    const fileId = await simpleUpload(
      fileName,
      content,
      "application/json",
      { type: "entry-meta", entryId },
      existing?.id ?? null,
    );

    return {
      provider: "google-drive",
      fileId,
      mimeType: "application/json",
    };
  }

  async downloadAllMeta(): Promise<
    Array<{
      meta: DiaryEntryMeta;
      metaFileRef: CloudFileRef;
      videoFileRef: CloudFileRef | null;
    }>
  > {
    const results: Array<{
      meta: DiaryEntryMeta;
      metaFileRef: CloudFileRef;
      videoFileRef: CloudFileRef | null;
    }> = [];

    // 1. List all metadata files
    let pageToken: string | undefined;
    const metaFiles: Array<{ id: string; name: string; appProperties: Record<string, string> }> = [];

    do {
      const params = new URLSearchParams({
        spaces: "appDataFolder",
        q: "appProperties has { key='type' and value='entry-meta' } and trashed=false",
        fields: "nextPageToken,files(id,name,appProperties)",
        pageSize: "100",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await driveFetch(`${DRIVE_API}/files?${params}`);
      const data = await res.json();
      metaFiles.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    // 2. List all video files (to match with metadata)
    const videoFiles: Array<{ id: string; name: string; appProperties: Record<string, string>; mimeType: string }> = [];
    pageToken = undefined;

    do {
      const params = new URLSearchParams({
        spaces: "appDataFolder",
        q: "appProperties has { key='type' and value='video' } and trashed=false",
        fields: "nextPageToken,files(id,name,appProperties,mimeType)",
        pageSize: "100",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await driveFetch(`${DRIVE_API}/files?${params}`);
      const data = await res.json();
      videoFiles.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Index video files by entryId
    const videoByEntryId = new Map<string, { id: string; mimeType: string }>();
    for (const vf of videoFiles) {
      const eid = vf.appProperties?.entryId;
      if (eid) {
        videoByEntryId.set(eid, { id: vf.id, mimeType: vf.mimeType });
      }
    }

    // 3. Download each metadata file and pair with video ref
    for (const mf of metaFiles) {
      try {
        const res = await driveFetch(
          `${DRIVE_API}/files/${mf.id}?alt=media`,
        );
        const meta = (await res.json()) as DiaryEntryMeta;
        const entryId = mf.appProperties?.entryId ?? meta.id;

        const videoInfo = videoByEntryId.get(entryId);
        const videoFileRef: CloudFileRef | null = videoInfo
          ? {
              provider: "google-drive",
              fileId: videoInfo.id,
              mimeType: videoInfo.mimeType,
            }
          : null;

        results.push({
          meta,
          metaFileRef: {
            provider: "google-drive",
            fileId: mf.id,
            mimeType: "application/json",
          },
          videoFileRef,
        });
      } catch (err) {
        console.warn(`[GoogleDrive] Failed to download metadata ${mf.name}:`, err);
      }
    }

    return results;
  }

  async deleteMeta(fileRef: CloudFileRef): Promise<void> {
    await driveFetch(`${DRIVE_API}/files/${fileRef.fileId}`, {
      method: "DELETE",
    });
  }

  // -- Quota ----------------------------------------------------------------

  async getQuota(): Promise<CloudQuota | null> {
    try {
      const res = await driveFetch(
        `${DRIVE_API}/about?fields=storageQuota`,
      );
      const data = await res.json();
      const sq = data.storageQuota;
      if (!sq) return null;

      const usage = parseInt(sq.usageInDrive ?? sq.usage ?? "0", 10);
      const limit = parseInt(sq.limit ?? "0", 10);

      return {
        usageBytes: usage,
        totalBytes: limit,
        usagePercent: limit > 0 ? (usage / limit) * 100 : 0,
      };
    } catch {
      return null;
    }
  }
}
