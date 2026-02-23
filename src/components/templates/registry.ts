import type { DiaryTemplate } from "~/models/types";
import { holographicRenderer } from "./renderers/holographic";
import { militaryHudRenderer } from "./renderers/military-hud";

/**
 * All available templates.
 * The first template is the default.
 */
export const templateRegistry: DiaryTemplate[] = [
  {
    id: "holographic",
    name: "Holographic",
    description: "Avatar-style translucent panels with cyan glow effects",
    previewImageUrl: "",
    render: holographicRenderer,
    config: {
      colorPrimary: "#00ffff",
      colorSecondary: "#0088aa",
      colorBackground: "rgba(0, 20, 30, 0.4)",
      fontFamily: "JetBrains Mono",
      showTimestamp: true,
      showElapsed: true,
      showRecordingIndicator: true,
      showScanLines: false,
      cornerStyle: "rounded",
    },
  },
  {
    id: "military-hud",
    name: "Military HUD",
    description: "Martian/NASA-style utilitarian heads-up display",
    previewImageUrl: "",
    render: militaryHudRenderer,
    config: {
      colorPrimary: "#ffa500",
      colorSecondary: "#33ff66",
      colorBackground: "rgba(0, 0, 0, 0.3)",
      fontFamily: "JetBrains Mono",
      showTimestamp: true,
      showElapsed: true,
      showRecordingIndicator: true,
      showScanLines: true,
      cornerStyle: "angular",
    },
  },
];
