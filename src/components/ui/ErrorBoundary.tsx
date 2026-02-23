import { ErrorBoundary as SolidErrorBoundary } from "solid-js";
import type { JSX } from "solid-js";
import Button from "~/components/ui/Button";

interface AppErrorBoundaryProps {
  children: JSX.Element;
}

export default function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div class="min-h-[50vh] flex items-center justify-center p-6">
          <div class="max-w-md w-full flex flex-col gap-4 p-6 rounded-lg border border-accent-red/30 bg-bg-secondary">
            <div class="flex items-center gap-2">
              <span class="text-accent-red font-mono text-xs font-bold tracking-wider">
                [SYSTEM ERROR]
              </span>
            </div>
            <h2 class="text-lg font-medium text-text-primary">
              Something went wrong
            </h2>
            <p class="text-sm text-text-secondary font-mono">
              {err instanceof Error ? err.message : "An unexpected error occurred"}
            </p>
            <div class="flex gap-3 pt-2">
              <Button variant="primary" size="sm" onClick={reset}>
                Try Again
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload App
              </Button>
            </div>
          </div>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
