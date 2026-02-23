import type { RouteSectionProps } from "@solidjs/router";
import AppShell from "~/components/layout/AppShell";

export default function App(props: RouteSectionProps) {
  return <AppShell>{props.children}</AppShell>;
}
