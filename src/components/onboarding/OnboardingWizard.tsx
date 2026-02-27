import { createSignal, Show } from "solid-js";
import type { StorageProviderType } from "~/models/types";
import WelcomeStep from "./WelcomeStep";
import StorageStep from "./StorageStep";

interface OnboardingWizardProps {
  onComplete: (choice: StorageProviderType) => void;
}

type Step = "welcome" | "storage";

export default function OnboardingWizard(props: OnboardingWizardProps) {
  const [step, setStep] = createSignal<Step>("welcome");

  function handleSkip() {
    // Skip defaults to ephemeral
    props.onComplete("ephemeral");
  }

  return (
    <div class="min-h-[100dvh] bg-bg-primary flex flex-col items-center overflow-y-auto p-6">
      <div class="flex-1" />
      <Show when={step() === "welcome"}>
        <WelcomeStep onNext={() => setStep("storage")} onSkip={handleSkip} />
      </Show>
      <Show when={step() === "storage"}>
        <StorageStep
          onComplete={props.onComplete}
          onBack={() => setStep("welcome")}
          onSkip={handleSkip}
        />
      </Show>
      <div class="flex-1" />
    </div>
  );
}
