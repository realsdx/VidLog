import { A, useLocation } from "@solidjs/router";
import type { JSX } from "solid-js";

interface AppShellProps {
  children: JSX.Element;
}

export default function AppShell(props: AppShellProps) {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Record" },
    { path: "/library", label: "Library" },
    { path: "/settings", label: "Settings" },
  ];

  function isActive(path: string): boolean {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  return (
    <div class="min-h-screen flex flex-col">
      {/* Top navbar */}
      <nav class="flex items-center justify-between px-6 py-3 border-b border-border-default bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-40">
        {/* Logo */}
        <div class="flex items-center gap-2">
          <span class="font-display font-bold text-lg tracking-wider text-accent-cyan">
            VIDEODIARY
          </span>
          <span class="text-[10px] font-mono text-text-secondary/50 mt-1">
            v0.1
          </span>
        </div>

        {/* Nav links */}
        <div class="flex items-center gap-1">
          {navItems.map((item) => (
            <A
              href={item.path}
              class={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                isActive(item.path)
                  ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent"
              }`}
            >
              {item.label}
            </A>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main class="flex-1 flex flex-col items-center p-6">{props.children}</main>
    </div>
  );
}
