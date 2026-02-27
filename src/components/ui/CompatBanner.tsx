import { createSignal, Show, For } from "solid-js";
import { checkBrowserCompat, type CompatCheck } from "~/utils/compat";

/**
 * Shows a one-time warning banner if any required browser features are missing.
 * Non-required features that are missing are shown as informational.
 */
export default function CompatBanner() {
  const checks = checkBrowserCompat();
  const issues = checks.filter((c) => !c.supported);
  const critical = issues.filter((c) => c.required);

  const [dismissed, setDismissed] = createSignal(false);

  // No issues = render nothing
  if (issues.length === 0) return null;

  return (
    <Show when={!dismissed()}>
      <div
        class={`mx-4 mt-4 p-3 rounded-lg border font-mono text-xs ${
          critical.length > 0
            ? "border-accent-red/40 bg-accent-red/10 text-accent-red/90"
            : "border-accent-amber/40 bg-accent-amber/10 text-accent-amber/90"
        }`}
        role="alert"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-1.5">
            <span class="font-bold uppercase tracking-wider text-[10px]">
              {critical.length > 0
                ? "[BROWSER COMPATIBILITY WARNING]"
                : "[NOTICE]"}
            </span>
            <For each={issues}>
              {(issue: CompatCheck) => (
                <p>
                  <span class="font-semibold">{issue.feature}:</span>{" "}
                  {issue.message}
                </p>
              )}
            </For>
            <Show when={critical.length > 0}>
              <p class="mt-1 opacity-70">
                VideoDiary requires a Chromium-based browser (Chrome, Edge) for
                full functionality.
              </p>
            </Show>
          </div>
          <button
            class="shrink-0 p-2 -m-1 rounded-md opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss compatibility warning"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  );
}
