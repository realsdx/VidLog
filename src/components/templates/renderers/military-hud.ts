import type { TemplateFrame } from "~/models/types";
import { formatDuration, formatMilitaryDateTime } from "~/utils/time";

/**
 * Military HUD template renderer — Martian/NASA style.
 *
 * Features:
 * - Angular corner brackets
 * - Amber/green monospace text
 * - Scan lines overlay
 * - Military datetime (top-right)
 * - RECORDING status + mission time (top-left)
 * - LOG ENTRY label (bottom-left)
 * - Decorative data bars on edges
 */
export function militaryHudRenderer(
  ctx: CanvasRenderingContext2D,
  frame: TemplateFrame,
): void {
  const { width, height, timestamp, elapsed, isRecording, title } = frame;
  const amber = "#ffa500";
  const amberDim = "rgba(255, 165, 0, 0.4)";
  const green = "#33ff66";
  const margin = Math.round(width * 0.03);
  const fontSize = Math.max(13, Math.round(width * 0.014));

  ctx.save();

  // ── Scan lines ──
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  // ── Angular corner brackets ──
  drawAngularCorners(ctx, width, height, margin, amber);

  // ── Decorative data bars (left edge) ──
  drawDataBars(ctx, margin + 4, margin + 80, height - 160, amber);

  // ── Top-left: Status + mission time ──
  ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "top";

  if (isRecording) {
    // Blinking "RECORDING" text
    const blink = Math.sin(Date.now() / 400) > 0;
    if (blink) {
      ctx.fillStyle = "#ff3333";
      ctx.fillText("● RECORDING", margin + 14, margin + 14);
    } else {
      ctx.fillStyle = amberDim;
      ctx.fillText("● RECORDING", margin + 14, margin + 14);
    }

    // Mission time
    ctx.fillStyle = green;
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `MISSION TIME: ${formatDuration(elapsed)}`,
      margin + 14,
      margin + 14 + fontSize + 8,
    );
  } else {
    ctx.fillStyle = amberDim;
    ctx.fillText("STANDBY", margin + 14, margin + 14);
  }

  // ── Top-right: Military date/time ──
  ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = amber;
  ctx.textAlign = "right";
  ctx.fillText(
    formatMilitaryDateTime(timestamp),
    width - margin - 14,
    margin + 14,
  );

  // System identifier below
  ctx.font = `400 ${Math.round(fontSize * 0.8)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = amberDim;
  ctx.fillText(
    "VIDLOG SYS v0.1",
    width - margin - 14,
    margin + 14 + fontSize + 6,
  );
  ctx.textAlign = "left";

  // ── Bottom-left: Log entry label ──
  const bottomY = height - margin - fontSize - 14;
  ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = amber;
  ctx.textBaseline = "bottom";

  if (title) {
    // Truncate if needed
    let displayTitle = title.toUpperCase();
    const maxW = width * 0.5;
    while (ctx.measureText(displayTitle).width > maxW && displayTitle.length > 3) {
      displayTitle = displayTitle.slice(0, -4) + "...";
    }
    ctx.fillText(displayTitle, margin + 14, bottomY);
  }

  // Entry label above title
  ctx.font = `400 ${Math.round(fontSize * 0.8)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = amberDim;
  ctx.fillText("LOG ENTRY", margin + 14, bottomY - fontSize - 4);

  // ── Bottom-right: Duration/size indicator ──
  if (isRecording) {
    ctx.textAlign = "right";
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = green;
    ctx.fillText(
      `T+ ${formatDuration(elapsed)}`,
      width - margin - 14,
      bottomY,
    );
    ctx.textAlign = "left";
  }

  // ── Horizontal rule lines ──
  ctx.strokeStyle = amberDim;
  ctx.lineWidth = 1;

  // Top line
  ctx.beginPath();
  ctx.moveTo(margin + 10, margin + 45 + fontSize);
  ctx.lineTo(width * 0.4, margin + 45 + fontSize);
  ctx.stroke();

  // Bottom line
  ctx.beginPath();
  ctx.moveTo(margin + 10, height - margin - fontSize * 2 - 30);
  ctx.lineTo(width * 0.4, height - margin - fontSize * 2 - 30);
  ctx.stroke();

  // ── Center crosshair (very subtle) ──
  const cx = width / 2;
  const cy = height / 2;
  const chSize = Math.round(width * 0.015);
  ctx.strokeStyle = "rgba(255, 165, 0, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - chSize, cy);
  ctx.lineTo(cx + chSize, cy);
  ctx.moveTo(cx, cy - chSize);
  ctx.lineTo(cx, cy + chSize);
  ctx.stroke();

  // Tiny circle at center
  ctx.beginPath();
  ctx.arc(cx, cy, chSize * 0.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/** Draw angular bracket corners */
function drawAngularCorners(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
): void {
  const len = Math.round(w * 0.05);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Top-left (angular — no rounding)
  ctx.beginPath();
  ctx.moveTo(margin, margin + len);
  ctx.lineTo(margin, margin);
  ctx.lineTo(margin + len, margin);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - margin - len, margin);
  ctx.lineTo(w - margin, margin);
  ctx.lineTo(w - margin, margin + len);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(margin, h - margin - len);
  ctx.lineTo(margin, h - margin);
  ctx.lineTo(margin + len, h - margin);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - margin - len, h - margin);
  ctx.lineTo(w - margin, h - margin);
  ctx.lineTo(w - margin, h - margin - len);
  ctx.stroke();
}

/** Draw decorative data bars along the left edge */
function drawDataBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  startY: number,
  height: number,
  color: string,
): void {
  const barCount = 12;
  const barHeight = 3;
  const gap = height / barCount;
  const maxBarWidth = 20;

  for (let i = 0; i < barCount; i++) {
    // Pseudo-random bar width based on time + index for animated feel
    const phase = Math.sin(Date.now() / 1000 + i * 0.8);
    const barWidth = maxBarWidth * (0.3 + 0.7 * ((phase + 1) / 2));
    const alpha = 0.2 + 0.3 * ((phase + 1) / 2);

    ctx.fillStyle = color.replace(")", `, ${alpha})`).replace("rgb", "rgba");
    // Since amber is hex, convert approach:
    ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
    ctx.fillRect(x, startY + i * gap, barWidth, barHeight);
  }
}
