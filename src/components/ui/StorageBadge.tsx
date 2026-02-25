import type { StorageProviderType } from "~/models/types";

/** Display label and style for each storage provider. */
const PROVIDER_CONFIG: Record<
  StorageProviderType,
  { label: string; compactLabel: string; accent: boolean }
> = {
  opfs: { label: "Device Storage", compactLabel: "Device", accent: true },
  filesystem: {
    label: "Folder Storage",
    compactLabel: "Folder",
    accent: true,
  },
  ephemeral: {
    label: "Session Only",
    compactLabel: "Session",
    accent: false,
  },
};

interface StorageBadgeProps {
  provider: StorageProviderType;
  /** Use smaller text for card grids. Defaults to false. */
  compact?: boolean;
}

/**
 * Consistent storage-provider badge used across DiaryCard, DiaryDetail,
 * PreviewPlayer, and anywhere else provider identity needs to be shown.
 */
export default function StorageBadge(props: StorageBadgeProps) {
  const config = () => PROVIDER_CONFIG[props.provider];

  const sizeClass = () =>
    props.compact ? "text-[10px] px-1 py-px" : "text-xs px-1.5 py-0.5";

  const colorClass = () =>
    config().accent
      ? "text-accent-cyan/60 border-accent-cyan/20"
      : "text-text-secondary/50 border-border-default";

  const label = () =>
    props.compact ? config().compactLabel : config().label;

  return (
    <span class={`font-mono border rounded ${sizeClass()} ${colorClass()}`}>
      {label()}
    </span>
  );
}
