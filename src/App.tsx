import { createSignal, createResource, Show, Suspense, lazy } from "solid-js";
import type { RouteSectionProps } from "@solidjs/router";
import AppShell from "~/components/layout/AppShell";
import AppErrorBoundary from "~/components/ui/ErrorBoundary";
import { onboardingStore } from "~/stores/onboarding";
import { settingsStore } from "~/stores/settings";
import { initializeApp, activateOPFS } from "~/services/init";
import type { StorageProviderType } from "~/models/types";

const OnboardingWizard = lazy(
  () => import("~/components/onboarding/OnboardingWizard"),
);

export default function App(props: RouteSectionProps) {
  // Track whether we've finished onboarding this session
  // (starts as the persisted value from localStorage)
  const [onboarded, setOnboarded] = createSignal(
    onboardingStore.isCompleted(),
  );

  // Initialize app (storage providers + load entries) once onboarded
  const [initialized] = createResource(onboarded, async (isOnboarded) => {
    if (!isOnboarded) return false;
    await initializeApp();
    return true;
  });

  async function handleOnboardingComplete(choice: StorageProviderType) {
    // Save onboarding state
    onboardingStore.complete(choice);
    // Update settings with the chosen provider
    settingsStore.updateSettings({ activeStorageProvider: choice });

    // If they chose OPFS, activate it now
    if (choice === "opfs") {
      const ok = await activateOPFS();
      if (!ok) {
        // OPFS failed — fall back to ephemeral silently
        settingsStore.updateSettings({ activeStorageProvider: "ephemeral" });
      }
    }
    // Filesystem is already activated by StorageStep (which calls activateFilesystem)
    // before invoking onComplete — no extra work needed here.

    setOnboarded(true);
  }

  return (
    <Show
      when={onboarded()}
      fallback={
        <Suspense>
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        </Suspense>
      }
    >
      <Show
        when={initialized()}
        fallback={
          <div class="min-h-[100dvh] flex items-center justify-center">
            <p class="font-mono text-sm text-text-secondary animate-pulse">
              Initializing...
            </p>
          </div>
        }
      >
        <AppErrorBoundary>
          <AppShell>{props.children}</AppShell>
        </AppErrorBoundary>
      </Show>
    </Show>
  );
}
