interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export default function WelcomeStep(props: WelcomeStepProps) {
  return (
    <div class="flex flex-col items-center justify-center text-center gap-8 max-w-md">
      {/* Logo */}
      <div class="flex flex-col items-center gap-3">
        <div class="px-6 py-3 border border-accent-cyan/40 rounded-sm bg-accent-cyan/5">
          <h1 class="font-display font-bold text-3xl tracking-[0.25em] text-accent-cyan">
            VIDLOG
          </h1>
        </div>
        <div class="h-px w-32 bg-gradient-to-r from-transparent via-accent-cyan/50 to-transparent" />
      </div>

      {/* Tagline */}
      <div class="flex flex-col gap-2">
        <p class="text-text-primary text-lg font-light">
          Your personal sci-fi video log.
        </p>
        <p class="text-text-secondary text-sm font-mono">
          Record. Persist. Review.
        </p>
      </div>

      {/* Features */}
      <div class="flex flex-col gap-2 text-xs text-text-secondary font-mono">
        <span>Cinematic overlays baked into your recordings</span>
        <span>Fully local — no servers, no accounts</span>
        <span>Works offline as a PWA</span>
      </div>

      {/* Actions */}
      <div class="flex items-center gap-4">
        <button
          class="px-8 py-2.5 rounded-md bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan font-mono text-sm font-medium hover:bg-accent-cyan/25 active:bg-accent-cyan/30 transition-colors cursor-pointer"
          onClick={props.onNext}
        >
          Next
        </button>
        <button
          class="px-6 py-2.5 rounded-md text-text-secondary text-sm font-mono hover:text-text-primary active:text-text-primary transition-colors cursor-pointer"
          onClick={props.onSkip}
        >
          Skip
        </button>
      </div>

      {/* Step indicator */}
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-accent-cyan" />
        <div class="w-2 h-2 rounded-full bg-border-default" />
      </div>
    </div>
  );
}
