import type { TemplateFrame } from "~/models/types";
import { formatDuration, formatMilitaryDateTime } from "~/utils/time";

/**
 * Military HUD template renderer — Martian/NASA style.
 *
 * Cinematic features:
 * - Edge darkening bands for universal contrast
 * - Stronger scan lines overlay
 * - All text drawn with dark backing + stroke outlines for readability
 * - Vertical frequency bars (real audio data) on left edge
 * - Horizontal audio peak meter at top
 * - Inner frame border (viewport feel)
 * - Enhanced angular corner brackets with tick marks
 * - Rotating center crosshair
 * - Real data readouts: military datetime, elapsed, resolution, audio level
 */
export function militaryHudRenderer(
  ctx: CanvasRenderingContext2D,
  frame: TemplateFrame,
): void {
  const { width, height, timestamp, elapsed, isRecording, title, audioLevel, audioFrequencyData } = frame;
  const amber = "#ffa500";
  const amberDim = "rgba(255, 165, 0, 0.35)";
  const green = "#33ff66";
  const panelBg = "rgba(0, 0, 0, 0.6)";
  const margin = Math.round(width * 0.03);
  const fontSize = Math.max(13, Math.round(width * 0.014));
  const now = Date.now();

  ctx.save();

  // ── Edge darkening bands ──
  drawEdgeDarkening(ctx, width, height);

  // ── Scan lines (stronger) ──
  ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }

  // ── Inner frame border ──
  drawInnerFrame(ctx, width, height, margin, amber);

  // ── Angular corner brackets (enhanced with ticks) ──
  drawAngularCorners(ctx, width, height, margin, amber);

  // ── Vertical audio frequency bars (left edge — real data) ──
  if (audioFrequencyData) {
    drawAudioBars(ctx, margin + 6, margin + 70, height - 140, audioFrequencyData, amber);
  }

  // ── Horizontal audio peak meter (top center) ──
  drawAudioPeakMeter(ctx, width, margin, audioLevel, amber, green);

  // ── Top-left: Status + mission time ──
  const tlPanelW = Math.round(width * 0.28);
  const tlPanelH = Math.round(fontSize * 3.8);
  const tlX = margin + 14;
  const tlY = margin + 14;

  // Dark backing
  ctx.fillStyle = panelBg;
  ctx.fillRect(tlX - 4, tlY - 4, tlPanelW, tlPanelH);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  if (isRecording) {
    // Blinking "RECORDING" with text outlines
    const blink = Math.sin(now / 400) > 0;
    const recColor = blink ? "#ff3333" : "rgba(255, 51, 51, 0.4)";
    drawHudText(ctx, "● RECORDING", tlX, tlY, fontSize, recColor, true);

    // Mission time
    drawHudText(
      ctx,
      `MISSION TIME: ${formatDuration(elapsed)}`,
      tlX,
      tlY + fontSize + 8,
      fontSize,
      green,
      false,
    );
  } else {
    drawHudText(ctx, "● STANDBY", tlX, tlY, fontSize, amberDim, false);
    drawHudText(ctx, "AWAITING RECORD", tlX, tlY + fontSize + 8, Math.round(fontSize * 0.85), amberDim, false);
  }

  // ── Top-right: Military date/time + system ID ──
  const trPanelW = Math.round(width * 0.28);
  const trPanelH = Math.round(fontSize * 3.8);
  const trX = width - margin - trPanelW - 10;
  const trY = margin + 14;

  // Dark backing
  ctx.fillStyle = panelBg;
  ctx.fillRect(trX - 4, trY - 4, trPanelW, trPanelH);

  ctx.textAlign = "right";
  drawHudText(
    ctx,
    formatMilitaryDateTime(timestamp),
    width - margin - 14,
    trY,
    fontSize,
    amber,
    false,
  );

  // System identifier
  drawHudText(
    ctx,
    "VIDLOG SYS v1.0",
    width - margin - 14,
    trY + fontSize + 6,
    Math.round(fontSize * 0.8),
    amberDim,
    false,
  );
  ctx.textAlign = "left";

  // ── Bottom-left: Log entry label + title ──
  const blPanelW = Math.round(width * 0.45);
  const blPanelH = Math.round(fontSize * 3.6);
  const bottomY = height - margin - blPanelH - 10;

  // Dark backing
  ctx.fillStyle = panelBg;
  ctx.fillRect(margin + 10, bottomY, blPanelW, blPanelH);

  ctx.textBaseline = "top";

  // "LOG ENTRY" label
  drawHudText(
    ctx,
    "LOG ENTRY",
    margin + 18,
    bottomY + 6,
    Math.round(fontSize * 0.8),
    amberDim,
    false,
  );

  // Title
  if (title) {
    let displayTitle = title.toUpperCase();
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    const maxW = blPanelW - 20;
    while (ctx.measureText(displayTitle).width > maxW && displayTitle.length > 3) {
      displayTitle = displayTitle.slice(0, -4) + "...";
    }
    drawHudText(
      ctx,
      displayTitle,
      margin + 18,
      bottomY + 6 + Math.round(fontSize * 0.8) + 6,
      fontSize,
      amber,
      true,
    );
  }

  // ── Bottom-right: Elapsed + resolution ──
  const brPanelW = Math.round(width * 0.22);
  const brPanelH = Math.round(fontSize * 3.6);
  const brX = width - margin - brPanelW - 10;
  const brY = height - margin - brPanelH - 10;

  // Dark backing
  ctx.fillStyle = panelBg;
  ctx.fillRect(brX, brY, brPanelW, brPanelH);

  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  if (isRecording) {
    drawHudText(
      ctx,
      `T+ ${formatDuration(elapsed)}`,
      width - margin - 18,
      brY + 6,
      fontSize,
      green,
      false,
    );
  } else {
    drawHudText(
      ctx,
      "T+ 00:00",
      width - margin - 18,
      brY + 6,
      fontSize,
      amberDim,
      false,
    );
  }

  drawHudText(
    ctx,
    `${width}×${height}`,
    width - margin - 18,
    brY + 6 + fontSize + 6,
    Math.round(fontSize * 0.8),
    amberDim,
    false,
  );
  ctx.textAlign = "left";

  // ── Horizontal rule lines ──
  ctx.strokeStyle = amberDim;
  ctx.lineWidth = 1;

  // Top rule
  const topRuleY = margin + 14 + Math.round(fontSize * 3.8) + 6;
  ctx.beginPath();
  ctx.moveTo(margin + 10, topRuleY);
  ctx.lineTo(width * 0.4, topRuleY);
  ctx.stroke();

  // Top rule (right side)
  ctx.beginPath();
  ctx.moveTo(width * 0.6, topRuleY);
  ctx.lineTo(width - margin - 10, topRuleY);
  ctx.stroke();

  // Bottom rule
  const bottomRuleY = bottomY - 6;
  ctx.beginPath();
  ctx.moveTo(margin + 10, bottomRuleY);
  ctx.lineTo(width * 0.4, bottomRuleY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.6, bottomRuleY);
  ctx.lineTo(width - margin - 10, bottomRuleY);
  ctx.stroke();

  // ── Center crosshair (with rotating dashes) ──
  drawCrosshair(ctx, width, height, amber, now);

  ctx.restore();
}

// ════════════════════════════════════════════════════════════════
// Helper functions
// ════════════════════════════════════════════════════════════════

/** Draw linear gradient bands on all edges for contrast */
function drawEdgeDarkening(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bandSize = Math.round(Math.max(w, h) * 0.08);

  // Top edge
  const topGrad = ctx.createLinearGradient(0, 0, 0, bandSize);
  topGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, bandSize);

  // Bottom edge
  const botGrad = ctx.createLinearGradient(0, h, 0, h - bandSize);
  botGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  botGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, h - bandSize, w, bandSize);

  // Left edge
  const leftGrad = ctx.createLinearGradient(0, 0, bandSize, 0);
  leftGrad.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  leftGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, bandSize, h);

  // Right edge
  const rightGrad = ctx.createLinearGradient(w, 0, w - bandSize, 0);
  rightGrad.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  rightGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = rightGrad;
  ctx.fillRect(w - bandSize, 0, bandSize, h);
}

/** Draw inner frame border — thin amber rectangle inset from corners */
function drawInnerFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
): void {
  const inset = margin + 4;
  ctx.strokeStyle = `rgba(255, 165, 0, 0.12)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  // Slightly brighter inner line
  ctx.strokeStyle = `rgba(255, 165, 0, 0.08)`;
  ctx.strokeRect(inset + 6, inset + 6, w - (inset + 6) * 2, h - (inset + 6) * 2);
  void color; // color param used for type consistency
}

/** Draw enhanced angular bracket corners with tick marks */
function drawAngularCorners(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
): void {
  const len = Math.round(w * 0.06);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Top-left
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

  // Tick marks along bracket arms
  const tickLen = 4;
  const tickCount = 3;
  ctx.strokeStyle = `rgba(255, 165, 0, 0.4)`;
  ctx.lineWidth = 1;

  for (let i = 1; i <= tickCount; i++) {
    const t = (i / (tickCount + 1)) * len;

    // Top-left horizontal ticks
    ctx.beginPath();
    ctx.moveTo(margin + t, margin);
    ctx.lineTo(margin + t, margin + tickLen);
    ctx.stroke();

    // Top-left vertical ticks
    ctx.beginPath();
    ctx.moveTo(margin, margin + t);
    ctx.lineTo(margin + tickLen, margin + t);
    ctx.stroke();

    // Top-right horizontal ticks
    ctx.beginPath();
    ctx.moveTo(w - margin - t, margin);
    ctx.lineTo(w - margin - t, margin + tickLen);
    ctx.stroke();

    // Top-right vertical ticks
    ctx.beginPath();
    ctx.moveTo(w - margin, margin + t);
    ctx.lineTo(w - margin - tickLen, margin + t);
    ctx.stroke();

    // Bottom-left horizontal ticks
    ctx.beginPath();
    ctx.moveTo(margin + t, h - margin);
    ctx.lineTo(margin + t, h - margin - tickLen);
    ctx.stroke();

    // Bottom-left vertical ticks
    ctx.beginPath();
    ctx.moveTo(margin, h - margin - t);
    ctx.lineTo(margin + tickLen, h - margin - t);
    ctx.stroke();

    // Bottom-right horizontal ticks
    ctx.beginPath();
    ctx.moveTo(w - margin - t, h - margin);
    ctx.lineTo(w - margin - t, h - margin - tickLen);
    ctx.stroke();

    // Bottom-right vertical ticks
    ctx.beginPath();
    ctx.moveTo(w - margin, h - margin - t);
    ctx.lineTo(w - margin - tickLen, h - margin - t);
    ctx.stroke();
  }
}

/** Draw vertical audio frequency bars on the left edge (real data) */
function drawAudioBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  startY: number,
  availableHeight: number,
  frequencyData: Uint8Array,
  color: string,
): void {
  // Use lower 24 bins (most relevant for voice)
  const binCount = Math.min(24, frequencyData.length);
  const barHeight = 3;
  const gap = availableHeight / binCount;
  const maxBarWidth = 24;

  for (let i = 0; i < binCount; i++) {
    const value = frequencyData[i] / 255;
    const barWidth = Math.max(2, value * maxBarWidth);
    const alpha = 0.15 + value * 0.65;

    // Darker bar background (track)
    ctx.fillStyle = "rgba(255, 165, 0, 0.06)";
    ctx.fillRect(x, startY + i * gap, maxBarWidth, barHeight);

    // Active bar
    ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
    ctx.fillRect(x, startY + i * gap, barWidth, barHeight);

    // Bright tip for high values
    if (value > 0.5) {
      ctx.fillStyle = color;
      ctx.fillRect(x + barWidth - 2, startY + i * gap, 2, barHeight);
    }
  }

  void color; // used above
}

/** Draw horizontal audio peak meter at top center */
function drawAudioPeakMeter(
  ctx: CanvasRenderingContext2D,
  width: number,
  margin: number,
  audioLevel: number,
  amber: string,
  green: string,
): void {
  const meterW = Math.round(width * 0.30);
  const meterH = 6;
  const meterX = Math.round((width - meterW) / 2);
  const meterY = margin + 8;

  // Dark track background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4);

  // Track outline
  ctx.strokeStyle = "rgba(255, 165, 0, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4);

  // Level fill — green → amber → red gradient based on level
  const fillW = Math.round(audioLevel * meterW);
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
    grad.addColorStop(0, green);
    grad.addColorStop(0.6, amber);
    grad.addColorStop(1, "#ff3333");
    ctx.fillStyle = grad;
    ctx.fillRect(meterX, meterY, fillW, meterH);
  }

  // Segment lines
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 1;
  const segments = 15;
  for (let i = 1; i < segments; i++) {
    const sx = meterX + (meterW / segments) * i;
    ctx.beginPath();
    ctx.moveTo(sx, meterY);
    ctx.lineTo(sx, meterY + meterH);
    ctx.stroke();
  }

  // Labels
  const labelSize = Math.max(8, Math.round(width * 0.007));
  ctx.font = `400 ${labelSize}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255, 165, 0, 0.4)";
  ctx.textAlign = "left";
  ctx.fillText("AUDIO", meterX, meterY + meterH + 3);
  ctx.textAlign = "right";
  ctx.fillText("LEVEL", meterX + meterW, meterY + meterH + 3);
  ctx.textAlign = "left";
}

/** Draw HUD-style text with dark stroke outline for contrast */
function drawHudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold: boolean,
): void {
  ctx.font = `${bold ? 700 : 500} ${size}px "JetBrains Mono", monospace`;

  // Dark stroke outline for readability on any background
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);

  // Fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draw center crosshair with rotating dashes */
function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  now: number,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const size = Math.round(w * 0.018);

  // Static crosshair lines
  ctx.strokeStyle = "rgba(255, 165, 0, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy);
  ctx.lineTo(cx + size, cy);
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx, cy + size);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating dashes around crosshair
  const dashRadius = size * 1.4;
  const rotation = now / 3000;
  const dashCount = 4;

  ctx.strokeStyle = `rgba(255, 165, 0, 0.12)`;
  ctx.lineWidth = 1;

  for (let i = 0; i < dashCount; i++) {
    const angle = rotation + (i * Math.PI * 2) / dashCount;
    const x1 = cx + Math.cos(angle) * (dashRadius - 4);
    const y1 = cy + Math.sin(angle) * (dashRadius - 4);
    const x2 = cx + Math.cos(angle) * (dashRadius + 4);
    const y2 = cy + Math.sin(angle) * (dashRadius + 4);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  void color; // used via amber in the caller
}
