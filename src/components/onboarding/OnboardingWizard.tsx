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
    <div class="min-h-screen bg-bg-primary flex items-center justify-center p-6">
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
    </div>
  );
}
