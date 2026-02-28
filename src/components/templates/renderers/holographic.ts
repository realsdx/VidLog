import type { TemplateFrame } from "~/models/types";
import { formatDuration, formatTime } from "~/utils/time";

/**
 * Holographic template renderer — Avatar-style.
 *
 * Cinematic features:
 * - Edge vignette for universal contrast on any background
 * - Animated rotating arcs near corners
 * - Circular ring audio waveform (real frequency data)
 * - Translucent dark panels with cyan glow borders
 * - All text has shadowBlur glow for readability
 * - Subtle grid overlay
 * - Single horizontal sweep line
 * - Corner brackets with secondary inner brackets
 * - Date/time, REC indicator, title, and real data readouts
 */
export function holographicRenderer(
  ctx: CanvasRenderingContext2D,
  frame: TemplateFrame,
): void {
  const { width, height, timestamp, elapsed, isRecording, title, audioLevel, audioFrequencyData } = frame;
  const cyan = "#00ffff";
  const cyanMid = "rgba(0, 255, 255, 0.5)";
  const cyanDim = "rgba(0, 255, 255, 0.25)";
  const panelBg = "rgba(0, 10, 20, 0.7)";
  // Use the longer dimension for sizing so HUD elements stay legible in portrait
  const sizingRef = Math.max(width, height);
  const margin = Math.round(sizingRef * 0.03);
  const fontSize = Math.max(14, Math.round(sizingRef * 0.016));
  const now = Date.now();

  ctx.save();

  // ── Edge vignette (radial gradient darkening edges/corners) ──
  drawVignette(ctx, width, height);

  // ── Subtle grid pattern ──
  ctx.strokeStyle = "rgba(0, 255, 255, 0.05)";
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

  // ── Horizontal sweep line (cycles top to bottom every 4 seconds) ──
  drawSweepLine(ctx, width, height, now);

  // ── Corner brackets (outer + inner) ──
  drawCornerBrackets(ctx, width, height, margin, cyan);
  drawCornerBrackets(ctx, width, height, margin + 8, cyanDim, 0.5);

  // ── Animated arcs near corners ──
  drawAnimatedArcs(ctx, width, height, margin, cyan, now);

  // ── Top-left panel: Date/Time ──
  const panelW = Math.round(width * 0.24);
  const panelH = Math.round(height * 0.10);
  const panelX = margin + 16;
  const panelY = margin + 16;

  drawGlowPanel(ctx, panelX, panelY, panelW, panelH, panelBg, cyan);

  // Time
  ctx.font = `600 ${Math.round(fontSize * 1.1)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = cyan;
  ctx.shadowColor = cyan;
  ctx.shadowBlur = 8;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(formatTime(timestamp), panelX + 14, panelY + panelH * 0.38);

  // Date below time (inside panel)
  ctx.font = `400 ${Math.round(fontSize * 0.75)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = cyanMid;
  ctx.shadowBlur = 4;
  const dateStr = new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  ctx.fillText(dateStr.toUpperCase(), panelX + 14, panelY + panelH * 0.72);
  ctx.shadowBlur = 0;

  // ── Top-right: REC indicator / STANDBY ──
  const recPanelW = Math.round(width * 0.24);
  const recPanelH = panelH;
  const recX = width - margin - recPanelW - 16;
  const recY = margin + 16;

  drawGlowPanel(ctx, recX, recY, recPanelW, recPanelH, panelBg, cyan);

  if (isRecording) {
    // Pulsing red dot
    const dotPulse = 0.5 + 0.5 * Math.sin(now / 300);
    ctx.fillStyle = `rgba(255, 51, 51, ${0.4 + dotPulse * 0.6})`;
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 8 + dotPulse * 8;
    ctx.beginPath();
    ctx.arc(recX + 18, recY + recPanelH * 0.38, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // "REC" text
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "#ff3333";
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 4;
    ctx.fillText("REC", recX + 30, recY + recPanelH * 0.38);
    ctx.shadowBlur = 0;

    // Elapsed time
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = cyan;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 6;
    ctx.fillText(formatDuration(elapsed), recX + 14, recY + recPanelH * 0.72);
    ctx.shadowBlur = 0;
  } else {
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = cyanDim;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 3;
    ctx.fillText("STANDBY", recX + 14, recY + recPanelH * 0.5);
    ctx.shadowBlur = 0;
  }

  // ── Bottom-center: Title bar ──
  if (title) {
    const titleH = Math.round(height * 0.065);
    const titleW = Math.round(width * 0.50);
    const titleX = Math.round((width - titleW) / 2);
    const titleY = height - margin - titleH - 20;

    drawGlowPanel(ctx, titleX, titleY, titleW, titleH, panelBg, cyan);

    ctx.font = `500 ${fontSize}px "Inter", "JetBrains Mono", sans-serif`;
    ctx.fillStyle = "#e0e8f0";
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 4;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Truncate title if too long
    let displayTitle = title;
    while (ctx.measureText(displayTitle).width > titleW - 28 && displayTitle.length > 3) {
      displayTitle = displayTitle.slice(0, -4) + "...";
    }
    ctx.fillText(displayTitle, titleX + 14, titleY + titleH / 2);
    ctx.shadowBlur = 0;
  }

  // ── Bottom-left: Real data readout (resolution + session time) ──
  const blX = margin + 16;
  const blY = height - margin - 16;
  const smallFont = Math.round(fontSize * 0.7);

  // Dark backing
  const readoutW = Math.round(width * 0.18);
  const readoutH = Math.round(smallFont * 3.2);
  drawGlowPanel(ctx, blX, blY - readoutH, readoutW, readoutH, panelBg, cyanDim, 0.3);

  ctx.font = `400 ${smallFont}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = cyanDim;
  ctx.shadowColor = cyan;
  ctx.shadowBlur = 2;
  ctx.fillText(`${width}×${height}`, blX + 8, blY - readoutH + smallFont + 6);
  ctx.fillText(`SESSION ${formatDuration(elapsed)}`, blX + 8, blY - 6);
  ctx.shadowBlur = 0;

  // ── Circular ring audio waveform (bottom-right) ──
  if (audioFrequencyData) {
    drawCircularWaveform(ctx, width, height, margin, audioFrequencyData, audioLevel, cyan, now);
  }

  // ── Audio level indicator arc (near bottom-right waveform) ──
  drawAudioLevelArc(ctx, width, height, margin, audioLevel, cyan, now);

  // ── Decorative horizontal line (bottom) ──
  const lineY = height - margin - 6;
  const grad = ctx.createLinearGradient(margin, lineY, width - margin, lineY);
  grad.addColorStop(0, "rgba(0, 255, 255, 0)");
  grad.addColorStop(0.2, "rgba(0, 255, 255, 0.4)");
  grad.addColorStop(0.8, "rgba(0, 255, 255, 0.4)");
  grad.addColorStop(1, "rgba(0, 255, 255, 0)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, lineY);
  ctx.lineTo(width - margin, lineY);
  ctx.stroke();

  // ── Top decorative line ──
  const topLineY = margin + 6;
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.moveTo(margin, topLineY);
  ctx.lineTo(width - margin, topLineY);
  ctx.stroke();

  ctx.restore();
}

// ════════════════════════════════════════════════════════════════
// Helper functions
// ════════════════════════════════════════════════════════════════

/** Draw edge vignette — radial gradient darkening corners and edges */
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.sqrt(cx * cx + cy * cy);

  const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.85, "rgba(0, 0, 0, 0.25)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.55)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** Draw animated rotating arcs near corners */
function drawAnimatedArcs(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
  now: number,
): void {
  const arcRadius = Math.round(w * 0.04);
  const lineWidth = 2;
  const speed1 = now / 2000;
  const speed2 = now / 3000;

  // Arc positions: offset from corners
  const offset = margin + arcRadius + 20;
  const positions = [
    { x: offset, y: offset, startAngle: speed1 },
    { x: w - offset, y: offset, startAngle: -speed2 },
    { x: offset, y: h - offset, startAngle: speed2 },
    { x: w - offset, y: h - offset, startAngle: -speed1 },
  ];

  ctx.lineWidth = lineWidth;

  for (const pos of positions) {
    // Two arc segments per corner
    const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now / 800 + pos.x));

    ctx.strokeStyle = `rgba(0, 255, 255, ${0.15 + pulse * 0.25})`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;

    // First arc segment (~90 degrees)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, arcRadius, pos.startAngle, pos.startAngle + Math.PI * 0.5);
    ctx.stroke();

    // Second arc segment (opposite side, ~60 degrees)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, arcRadius, pos.startAngle + Math.PI, pos.startAngle + Math.PI + Math.PI * 0.35);
    ctx.stroke();

    // Inner smaller arc
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.08 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, arcRadius * 0.6, -pos.startAngle, -pos.startAngle + Math.PI * 0.4);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

/** Draw horizontal sweep line that cycles top to bottom */
function drawSweepLine(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const period = 4000; // 4 seconds per full sweep
  const progress = (now % period) / period;
  const y = progress * h;

  const grad = ctx.createLinearGradient(0, y, w, y);
  grad.addColorStop(0, "rgba(0, 255, 255, 0)");
  grad.addColorStop(0.3, "rgba(0, 255, 255, 0.06)");
  grad.addColorStop(0.7, "rgba(0, 255, 255, 0.06)");
  grad.addColorStop(1, "rgba(0, 255, 255, 0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 1, w, 2);

  // Slight glow band around the sweep line
  const glowGrad = ctx.createLinearGradient(0, y - 20, 0, y + 20);
  glowGrad.addColorStop(0, "rgba(0, 255, 255, 0)");
  glowGrad.addColorStop(0.5, "rgba(0, 255, 255, 0.02)");
  glowGrad.addColorStop(1, "rgba(0, 255, 255, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, y - 20, w, 40);
}

/** Draw rounded corner brackets */
function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  color: string,
  alpha: number = 1,
): void {
  const len = Math.round(w * 0.06);
  const r = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = alpha < 1 ? 1 : 2;
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = alpha < 1 ? 0 : 4;

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
  ctx.globalAlpha = 1;
}

/** Draw circular ring audio waveform (frequency bars arranged in an arc) */
function drawCircularWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  frequencyData: Uint8Array,
  _audioLevel: number,
  color: string,
  now: number,
): void {
  const cx = w - margin - Math.round(w * 0.10);
  const cy = h - margin - Math.round(h * 0.14);
  const innerRadius = Math.round(Math.min(w, h) * 0.045);
  const maxBarHeight = Math.round(Math.min(w, h) * 0.04);

  // Use a subset of frequency bins (lower frequencies are more interesting for voice)
  const binCount = Math.min(48, frequencyData.length);
  const arcSpan = Math.PI * 1.5; // 270 degrees
  const startAngle = Math.PI * 0.75; // Start from bottom-left
  const barAngle = arcSpan / binCount;

  // Subtle rotation animation
  const rotation = now / 20000; // Very slow rotation

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  // Dark backing circle
  ctx.fillStyle = "rgba(0, 10, 20, 0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius + maxBarHeight + 4, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring outline
  ctx.strokeStyle = "rgba(0, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius - 2, 0, Math.PI * 2);
  ctx.stroke();

  // Draw frequency bars
  for (let i = 0; i < binCount; i++) {
    const angle = startAngle + i * barAngle;
    const value = frequencyData[i] / 255;
    const barHeight = Math.max(2, value * maxBarHeight);
    const alpha = 0.2 + value * 0.6;

    ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.shadowColor = color;
    ctx.shadowBlur = value > 0.5 ? 4 : 0;
    ctx.lineWidth = Math.max(1.5, (arcSpan * innerRadius) / binCount * 0.5);

    const x1 = Math.cos(angle) * innerRadius;
    const y1 = Math.sin(angle) * innerRadius;
    const x2 = Math.cos(angle) * (innerRadius + barHeight);
    const y2 = Math.sin(angle) * (innerRadius + barHeight);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Draw a small arc showing overall audio level */
function drawAudioLevelArc(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  audioLevel: number,
  color: string,
  _now: number,
): void {
  const cx = w - margin - Math.round(w * 0.10);
  const cy = h - margin - Math.round(h * 0.14);
  const radius = Math.round(Math.min(w, h) * 0.045) + Math.round(Math.min(w, h) * 0.04) + 8;

  // Level arc — sweeps proportional to audioLevel
  const sweep = audioLevel * Math.PI * 1.2;
  if (sweep > 0.01) {
    const startAngle = -Math.PI * 0.5 - sweep / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.4 + audioLevel * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

/** Draw a translucent panel with glow border */
function drawGlowPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: string,
  borderColor: string,
  borderAlpha: number = 1,
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
  ctx.globalAlpha = borderAlpha;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
