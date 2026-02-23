import { createSignal } from "solid-js";

// Captures the `beforeinstallprompt` event so the app can show
// a custom install button at the right time.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const [installPrompt, setInstallPrompt] =
  createSignal<BeforeInstallPromptEvent | null>(null);
const [isInstalled, setIsInstalled] = createSignal(false);

// Check if already installed (standalone mode)
if (
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true
) {
  setIsInstalled(true);
}

// Capture the install prompt event
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  setInstallPrompt(e as BeforeInstallPromptEvent);
});

// Detect when the app gets installed
window.addEventListener("appinstalled", () => {
  setIsInstalled(true);
  setInstallPrompt(null);
});

export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt();
  if (!prompt) return false;

  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  setInstallPrompt(null);
  return outcome === "accepted";
}

export function canInstall(): boolean {
  return installPrompt() !== null && !isInstalled();
}

export { isInstalled };
