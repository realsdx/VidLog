import { type JSX, splitProps } from "solid-js";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variantClasses: Record<string, string> = {
  primary:
    "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/30 hover:border-accent-cyan/60",
  secondary:
    "bg-bg-elevated text-text-primary border border-border-default hover:bg-bg-elevated/80 hover:border-text-secondary/40",
  danger:
    "bg-accent-red/20 text-accent-red border border-accent-red/40 hover:bg-accent-red/30",
  ghost:
    "bg-transparent text-text-secondary border border-transparent hover:text-text-primary hover:bg-bg-elevated",
};

const sizeClasses: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "class",
    "children",
  ]);

  const variant = () => local.variant ?? "primary";
  const size = () => local.size ?? "md";

  return (
    <button
      class={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant()]} ${sizeClasses[size()]} ${local.class ?? ""}`}
      {...rest}
    >
      {local.children}
    </button>
  );
}
