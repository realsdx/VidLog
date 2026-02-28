/**
 * Google OAuth via Google Identity Services (GIS) Token Model.
 *
 * Uses the implicit grant flow suitable for client-side SPAs.
 * No refresh tokens — the user re-authorizes when the token expires (~1 hour).
 *
 * Required scope: https://www.googleapis.com/auth/drive.appdata
 * This is a non-sensitive scope (hidden app-only folder), which makes
 * the OAuth consent screen verification process simpler.
 */

import { createSignal } from "solid-js";

// ---------------------------------------------------------------------------
// GIS type declarations (loaded dynamically from CDN)
// ---------------------------------------------------------------------------

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
  callback: (response: TokenResponse) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
  scope: string;
}

interface Google {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string; message: string }) => void;
      }): TokenClient;
      revoke(token: string, callback?: () => void): void;
      hasGrantedAllScopes(
        response: TokenResponse,
        ...scopes: string[]
      ): boolean;
    };
  };
}

declare global {
  interface Window {
    google?: Google;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Google OAuth Client ID resolution order:
 * 1. User override in localStorage (set via Settings > Developer)
 * 2. Build-time env var VITE_GOOGLE_CLIENT_ID
 *
 * If neither is set, the user must configure one in Settings.
 */
const CLIENT_ID_KEY = "vidlog_google_client_id";
const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const [accessToken, setAccessToken] = createSignal<string | null>(null);
const [tokenExpiresAt, setTokenExpiresAt] = createSignal<number>(0);
const [userEmail, setUserEmail] = createSignal<string | null>(null);
const [isInitialized, setIsInitialized] = createSignal(false);

let tokenClient: TokenClient | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

// ---------------------------------------------------------------------------
// Script Loading
// ---------------------------------------------------------------------------

let gisLoadPromise: Promise<void> | null = null;

/**
 * Load the Google Identity Services script from CDN.
 * Returns a promise that resolves when the script is loaded.
 */
function loadGisScript(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;

  if (window.google?.accounts?.oauth2) {
    gisLoadPromise = Promise.resolve();
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

// ---------------------------------------------------------------------------
// Token Client Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the GIS token client.
 * Must be called before any auth operations.
 */
async function initialize(): Promise<void> {
  if (isInitialized()) return;

  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Google OAuth Client ID not configured. Set it in Settings.");
  }

  await loadGisScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services failed to initialize");
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: handleTokenResponse,
    error_callback: handleTokenError,
  });

  setIsInitialized(true);
}

function handleTokenResponse(response: TokenResponse): void {
  if (response.error) {
    const err = new Error(response.error_description || response.error);
    pendingReject?.(err);
    pendingReject = null;
    pendingResolve = null;
    return;
  }

  setAccessToken(response.access_token);
  setTokenExpiresAt(Date.now() + response.expires_in * 1000);

  // Fetch user info to get email
  void fetchUserEmail(response.access_token);

  pendingResolve?.(response.access_token);
  pendingResolve = null;
  pendingReject = null;
}

function handleTokenError(error: { type: string; message: string }): void {
  const err = new Error(`OAuth error: ${error.type} — ${error.message}`);
  pendingReject?.(err);
  pendingReject = null;
  pendingResolve = null;
}

/**
 * Fetch the user's email from Google's userinfo endpoint.
 */
async function fetchUserEmail(token: string): Promise<void> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUserEmail(data.email ?? null);
    }
  } catch {
    // Non-critical — email is just for display
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const googleAuth = {
  accessToken,
  userEmail,
  isInitialized,

  /** Check if the current token is still valid */
  isAuthenticated(): boolean {
    return !!accessToken() && Date.now() < tokenExpiresAt();
  },

  /**
   * Request a new access token via the OAuth popup.
   * @returns The access token string
   */
  async signIn(): Promise<string> {
    await initialize();

    if (!tokenClient) {
      throw new Error("Token client not initialized");
    }

    return new Promise<string>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      // No prompt override — lets Google decide (shows consent if first time,
      // silent or select_account if returning)
      tokenClient!.requestAccessToken();
    });
  },

  /**
   * Revoke the current token and clear state.
   */
  signOut(): void {
    const token = accessToken();
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {
        // Revocation complete
      });
    }
    setAccessToken(null);
    setTokenExpiresAt(0);
    setUserEmail(null);
  },

  /**
   * Get a valid access token, re-authenticating if expired.
   * Throws if the user cancels the re-auth popup.
   */
  async getValidToken(): Promise<string> {
    const token = accessToken();
    if (token && Date.now() < tokenExpiresAt()) {
      return token;
    }
    // Token expired — request a new one
    return googleAuth.signIn();
  },

  /**
   * Try to silently restore a previous session.
   * GIS token model does NOT support silent token refresh — this is a no-op
   * that returns false. The actual re-auth happens when an API call gets a 401.
   */
  async tryRestoreSession(): Promise<boolean> {
    // With the implicit flow, tokens are not persisted.
    // We can't silently restore without a user gesture.
    // The session state is effectively "not authenticated until they sign in again".
    return false;
  },

  /** Get the configured OAuth Client ID */
  getClientId,

  /** Whether a user-provided Client ID override is set (vs. the default) */
  hasCustomClientId(): boolean {
    try {
      return !!localStorage.getItem(CLIENT_ID_KEY);
    } catch {
      return false;
    }
  },

  /** Set the OAuth Client ID (persisted to localStorage as override) */
  setClientId(clientId: string): void {
    try {
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    } catch {
      // Ignore
    }
    // Reset initialization so the next signIn uses the new client ID
    setIsInitialized(false);
    tokenClient = null;
  },

  /** Clear the user-provided Client ID override, reverting to the default */
  clearClientId(): void {
    try {
      localStorage.removeItem(CLIENT_ID_KEY);
    } catch {
      // Ignore
    }
    setIsInitialized(false);
    tokenClient = null;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientId(): string | null {
  // 1. Check localStorage override (set by user in Settings > Developer)
  try {
    const override = localStorage.getItem(CLIENT_ID_KEY);
    if (override) return override;
  } catch {
    // localStorage unavailable
  }
  // 2. Fall back to build-time env var
  return DEFAULT_CLIENT_ID || null;
}
