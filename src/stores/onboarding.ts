import { createSignal } from "solid-js";
import type { OnboardingState, StorageProviderType } from "~/models/types";

const STORAGE_KEY = "vidlog_onboarding";

const defaultState: OnboardingState = {
  completed: false,
  storageChoice: "ephemeral",
  completedAt: null,
};

/** Read onboarding state from localStorage synchronously on boot */
function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed };
    }
  } catch {
    // Corrupted data — treat as not onboarded
  }
  return { ...defaultState };
}

function persistOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

const [onboarding, setOnboarding] = createSignal<OnboardingState>(
  loadOnboarding(),
);

export const onboardingStore = {
  onboarding,

  /** Whether the user has completed (or skipped) onboarding */
  isCompleted(): boolean {
    return onboarding().completed;
  },

  /** Get the storage choice from onboarding */
  getStorageChoice(): StorageProviderType {
    return onboarding().storageChoice;
  },

  /** Complete onboarding with the chosen storage provider */
  complete(storageChoice: StorageProviderType): void {
    const state: OnboardingState = {
      completed: true,
      storageChoice,
      completedAt: Date.now(),
    };
    setOnboarding(state);
    persistOnboarding(state);
  },

  /** Skip onboarding — defaults to ephemeral storage */
  skip(): void {
    this.complete("ephemeral");
  },

  /** Reset onboarding (for testing/dev) */
  reset(): void {
    setOnboarding({ ...defaultState });
    localStorage.removeItem(STORAGE_KEY);
  },
};
