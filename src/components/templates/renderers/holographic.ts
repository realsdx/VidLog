import type { TemplateFrame } from "~/models/types";
import { formatDuration, formatTime } from "~/utils/time";

/**
 * Holographic template renderer — Avatar-style.
 *
 * Features:
 * - Translucent rounded panels with cyan glow
 * - Date/time display (top-left)
 * - REC indicator + elapsed (top-right)
 * - Title bar (bottom)
 * - Corner bracket decorations
 * - Subtle grid pattern
 */
export function holographicRenderer(
  ctx: CanvasRenderingContext2D,
  frame: TemplateFrame,
): void {
  const { width, height, timestamp, elapsed, isRecording, title } = frame;
  const cyan = "#00ffff";
  const cyanDim = "rgba(0, 255, 255, 0.3)";
  const panelBg = "rgba(0, 20, 30, 0.4)";
  const margin = Math.round(width * 0.03);
  const fontSize = Math.max(14, Math.round(width * 0.016));

  ctx.save();

  // ── Grid pattern (subtle) ──
  ctx.strokeStyle = "rgba(0, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  const gridSize = Math.round(width * 0.04);
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // ── Corner brackets (rounded) ──
  drawCornerBrackets(ctx, width, height, margin, cyan);

  // ── Top-left panel: Date/Time ──
  const panelW = Math.round(width * 0.22);
  const panelH = Math.round(height * 0.09);
  const panelX = margin + 10;
  const panelY = margin + 10;

  drawGlowPanel(ctx, panelX, panelY, panelW, panelH, panelBg, cyan);

  ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = cyan;
  ctx.shadowColor = cyan;
  ctx.shadowBlur = 6;
  ctx.textBaseline = "middle";
  ctx.fillText(formatTime(timestamp), panelX + 12, panelY + panelH / 2);
  ctx.shadowBlur = 0;

  // Small date below the panel
  ctx.font = `400 ${Math.round(fontSize * 0.75)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = cyanDim;
  const dateStr = new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  ctx.fillText(dateStr.toUpperCase(), panelX + 12, panelY + panelH + 14);

  // ── Top-right: REC indicator + elapsed ──
  if (isRecording) {
    const recX = width - margin - panelW - 10;
    const recY = margin + 10;

    drawGlowPanel(ctx, recX, recY, panelW, panelH, panelBg, cyan);

    // Pulsing red dot
    const dotPulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
    ctx.fillStyle = `rgba(255, 51, 51, ${0.4 + dotPulse * 0.6})`;
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 8 + dotPulse * 6;
    ctx.beginPath();
    ctx.arc(recX + 20, recY + panelH / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // "REC" text
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "#ff3333";
    ctx.fillText("REC", recX + 34, recY + panelH / 2);

    // Elapsed time
    ctx.fillStyle = cyan;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 4;
    ctx.fillText(formatDuration(elapsed), recX + 34 + ctx.measureText("REC  ").width, recY + panelH / 2);
    ctx.shadowBlur = 0;
  }

  // ── Bottom: Title bar ──
  if (title) {
    const titleH = Math.round(height * 0.06);
    const titleW = Math.round(width * 0.5);
    const titleX = Math.round((width - titleW) / 2);
    const titleY = height - margin - titleH - 10;

    drawGlowPanel(ctx, titleX, titleY, titleW, titleH, panelBg, cyan);

    ctx.font = `500 ${fontSize}px "Inter", sans-serif`;
    ctx.fillStyle = "#e0e0e8";
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 3;
    ctx.textBaseline = "middle";

    // Truncate title if too long
    let displayTitle = title;
    while (ctx.measureText(displayTitle).width > titleW - 24 && displayTitle.length > 3) {
      displayTitle = displayTitle.slice(0, -4) + "...";
    }
    ctx.fillText(displayTitle, titleX + 12, titleY + titleH / 2);
    ctx.shadowBlur = 0;
  }

  // ── Decorative horizontal line ──
  const lineY = height - margin - 4;
  const grad = ctx.createLinearGradient(margin, lineY, width - margin, lineY);
  grad.addColorStop(0, "rgba(0, 255, 255, 0)");
  grad.addColorStop(0.3, "rgba(0, 255, 255, 0.4)");
  grad.addColorStop(0.7, "rgba(0, 255, 255, 0.4)");
  grad.addColorStop(1, "rgba(0, 255, 255, 0)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, lineY);
  ctx.lineTo(width - margin, lineY);
  ctx.stroke();

  ctx.restore();
}

/** Draw rounded corner brackets at all 4 corners */
function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
): void {
  const len = Math.round(w * 0.06);
  const r = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(margin, margin + len);
  ctx.lineTo(margin, margin + r);
  ctx.arcTo(margin, margin, margin + r, margin, r);
  ctx.lineTo(margin + len, margin);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - margin - len, margin);
  ctx.lineTo(w - margin - r, margin);
  ctx.arcTo(w - margin, margin, w - margin, margin + r, r);
  ctx.lineTo(w - margin, margin + len);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(margin, h - margin - len);
  ctx.lineTo(margin, h - margin - r);
  ctx.arcTo(margin, h - margin, margin + r, h - margin, r);
  ctx.lineTo(margin + len, h - margin);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - margin, h - margin - len);
  ctx.lineTo(w - margin, h - margin - r);
  ctx.arcTo(w - margin, h - margin, w - margin - r, h - margin, r);
  ctx.lineTo(w - margin - len, h - margin);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

/** Draw a translucent panel with a subtle glow border */
function drawGlowPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: string,
  borderColor: string,
): void {
  const r = 6;

  // Background fill
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  // Glow border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
