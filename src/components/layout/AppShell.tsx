import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import type { JSX } from "solid-js";
import ToastContainer from "~/components/ui/Toast";
import CompatBanner from "~/components/ui/CompatBanner";
import StorageRecoveryBanner from "~/components/ui/StorageRecoveryBanner";
import { canInstall, promptInstall } from "~/services/pwa";

interface AppShellProps {
  children: JSX.Element;
}

export default function AppShell(props: AppShellProps) {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Record", icon: RecordIcon },
    { path: "/library", label: "Library", icon: LibraryIcon },
    { path: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  function isActive(path: string): boolean {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  return (
    <div class="min-h-[100dvh] flex flex-col">
      {/* Skip to main content — visible only on focus */}
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-accent-cyan focus:text-bg-primary focus:text-sm focus:font-mono focus:font-bold focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
      >
        Skip to main content
      </a>

      {/* Top navbar — hidden on mobile */}
      <nav aria-label="Main navigation" class="hidden md:flex items-center justify-between px-6 py-3 border-b border-border-default bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-40 safe-area-x">
        {/* Logo */}
        <div class="flex items-center gap-2">
          <span class="font-display font-bold text-lg tracking-wider text-accent-cyan">
            VIDLOG
          </span>
          <span class="text-[10px] font-mono text-text-secondary/50 mt-1">
            v0.1
          </span>
        </div>

        {/* Nav links + install */}
        <div class="flex items-center gap-1" role="list">
          {navItems.map((item) => (
            <A
              href={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              class={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 ${
                isActive(item.path)
                  ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent"
              }`}
            >
              {item.label}
            </A>
          ))}

          <Show when={canInstall()}>
            <button
              class="ml-2 px-3 py-1.5 rounded-md text-xs font-mono font-medium text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
              onClick={promptInstall}
              aria-label="Install VidLog as an app"
            >
              Install
            </button>
          </Show>
        </div>
      </nav>

      {/* Mobile top bar — only logo + install */}
      <header class="flex md:hidden items-center justify-between px-4 pb-2 border-b border-border-default bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-40 safe-area-top safe-area-x" style={{ "--sa-top-min": "0.5rem" }}>
        <div class="flex items-center gap-2">
          <span class="font-display font-bold text-base tracking-wider text-accent-cyan">
            VIDLOG
          </span>
        </div>
        <Show when={canInstall()}>
          <button
            class="px-2.5 py-1 rounded-md text-[10px] font-mono font-medium text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            onClick={promptInstall}
            aria-label="Install VidLog as an app"
          >
            Install
          </button>
        </Show>
      </header>

      {/* Browser compatibility warnings */}
      <CompatBanner />

      {/* Storage recovery banner (shown when filesystem fallback occurred) */}
      <StorageRecoveryBanner />

      {/* Main content */}
      <main id="main-content" class="flex-1 flex flex-col items-center p-4 md:p-6 pb-20 md:pb-6 safe-area-x">
        {props.children}
      </main>

      {/* Bottom navigation — mobile only */}
      <nav aria-label="Mobile navigation" class="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border-default bg-bg-secondary/95 backdrop-blur-sm safe-area-bottom safe-area-x">
        <div class="flex items-center justify-around py-1">
          {navItems.map((item) => (
            <A
              href={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              aria-label={item.label}
              class={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg min-w-[64px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 ${
                isActive(item.path)
                  ? "text-accent-cyan"
                  : "text-text-secondary active:text-text-primary"
              }`}
            >
              <item.icon active={isActive(item.path)} />
              <span class="text-[10px] font-mono font-medium">{item.label}</span>
            </A>
          ))}
        </div>
      </nav>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}

// Navigation icons
function RecordIcon(props: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        stroke-width="1.5"
        fill={props.active ? "currentColor" : "none"}
        opacity={props.active ? 0.3 : 1}
      />
      <circle cx="10" cy="10" r="4" fill="currentColor" />
    </svg>
  );
}

function LibraryIcon(props: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="6" height="6" rx="1" fill={props.active ? "currentColor" : "none"} opacity={props.active ? 0.3 : 1} />
      <rect x="11" y="3" width="6" height="6" rx="1" fill={props.active ? "currentColor" : "none"} opacity={props.active ? 0.3 : 1} />
      <rect x="3" y="11" width="6" height="6" rx="1" fill={props.active ? "currentColor" : "none"} opacity={props.active ? 0.3 : 1} />
      <rect x="11" y="11" width="6" height="6" rx="1" fill={props.active ? "currentColor" : "none"} opacity={props.active ? 0.3 : 1} />
    </svg>
  );
}

function SettingsIcon(props: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="10" cy="10" r="3" fill={props.active ? "currentColor" : "none"} opacity={props.active ? 0.3 : 1} />
      <path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.22 4.22l1.42 1.42m8.72 8.72l1.42 1.42M4.22 15.78l1.42-1.42m8.72-8.72l1.42-1.42" />
    </svg>
  );
}
