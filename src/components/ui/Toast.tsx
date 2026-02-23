import { For } from "solid-js";
import { toastStore, type ToastType } from "~/stores/toast";

const typeStyles: Record<ToastType, string> = {
  success:
    "border-accent-green/40 bg-accent-green/10 text-accent-green",
  error:
    "border-accent-red/40 bg-accent-red/10 text-accent-red",
  warning:
    "border-accent-amber/40 bg-accent-amber/10 text-accent-amber",
  info: "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan",
};

const typeIcons: Record<ToastType, string> = {
  success: "OK",
  error: "ERR",
  warning: "WARN",
  info: "INFO",
};

export default function ToastContainer() {
  return (
    <div
      class="fixed bottom-20 md:bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full"
      aria-live="polite"
      aria-label="Notifications"
    >
      <For each={toastStore.toasts()}>
        {(toast) => (
          <div
            class={`pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-lg border backdrop-blur-sm font-mono text-sm
              animate-toast-in ${typeStyles[toast.type]}`}
            role="alert"
          >
            <span class="text-[10px] font-bold uppercase tracking-wider opacity-70 mt-0.5 shrink-0">
              [{typeIcons[toast.type]}]
            </span>
            <span class="flex-1 text-xs leading-relaxed">{toast.message}</span>
            <button
              class="shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer text-current ml-1"
              onClick={() => toastStore.removeToast(toast.id)}
              aria-label="Dismiss notification"
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
        )}
      </For>
    </div>
  );
}
