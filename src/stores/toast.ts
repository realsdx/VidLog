import { createSignal } from "solid-js";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

let nextId = 0;

const [toasts, setToasts] = createSignal<Toast[]>([]);

function addToast(
  message: string,
  type: ToastType = "info",
  duration = 3000,
): void {
  const id = nextId++;
  const toast: Toast = { id, message, type, duration };
  setToasts((prev) => [...prev, toast]);

  // Auto-remove after duration
  setTimeout(() => {
    removeToast(id);
  }, duration);
}

function removeToast(id: number): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

export const toastStore = {
  toasts,
  addToast,
  removeToast,
  success: (msg: string, duration?: number) =>
    addToast(msg, "success", duration),
  error: (msg: string, duration?: number) =>
    addToast(msg, "error", duration ?? 5000),
  info: (msg: string, duration?: number) => addToast(msg, "info", duration),
  warning: (msg: string, duration?: number) =>
    addToast(msg, "warning", duration ?? 4000),
};
