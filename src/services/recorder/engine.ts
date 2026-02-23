import type { DiaryTemplate, TemplateFrame } from "~/models/types";

export interface RecordingEngineConfig {
  canvas: HTMLCanvasElement;
  stream: MediaStream;
  template: DiaryTemplate | null;
  title: string;
  bitrate: number;
  onElapsedUpdate: (elapsed: number) => void;
  onMaxDuration: () => void;
  maxDuration: number;
}

/**
 * RecordingEngine handles:
 * 1. Drawing webcam frames + template overlays onto a canvas
 * 2. Capturing the composited canvas as a MediaStream
 * 3. Recording via MediaRecorder
 *
 * Pipeline:
 *   Webcam → hidden <video> → Canvas drawImage → template.render() → captureStream → MediaRecorder → Blob
 */
export class RecordingEngine {
  private config: RecordingEngineConfig;
  private videoEl: HTMLVideoElement;
  private ctx: CanvasRenderingContext2D;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private animFrameId: number = 0;
  private startTime: number = 0;
  private pausedElapsed: number = 0;
  private isPaused: boolean = false;
  private isRunning: boolean = false;

  constructor(config: RecordingEngineConfig) {
    this.config = config;

    // Create hidden video element to play the webcam stream
    this.videoEl = document.createElement("video");
    this.videoEl.srcObject = config.stream;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;

    const ctx = config.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get canvas 2D context");
    this.ctx = ctx;
  }

  /** Prepare the engine — starts video playback and render loop (but not recording) */
  async prepare(): Promise<void> {
    await this.videoEl.play();

    // Match canvas to actual video dimensions
    const vw = this.videoEl.videoWidth;
    const vh = this.videoEl.videoHeight;
    if (vw && vh) {
      this.config.canvas.width = vw;
      this.config.canvas.height = vh;
    }

    this.isRunning = true;
    this.renderLoop();
  }

  /** Start recording */
  start(): void {
    // Capture the canvas as a stream at 30fps
    const canvasStream = this.config.canvas.captureStream(30);

    // Add audio tracks from the webcam stream
    const audioTracks = this.config.stream.getAudioTracks();
    for (const track of audioTracks) {
      canvasStream.addTrack(track);
    }

    // Determine best supported mime type
    const mimeType = this.getSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: this.config.bitrate,
    });

    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    // Collect data every second for memory efficiency
    this.mediaRecorder.start(1000);
    this.startTime = performance.now();
    this.pausedElapsed = 0;
    this.isPaused = false;
  }

  /** Pause recording */
  pause(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.pause();
      this.pausedElapsed = this.getElapsed();
      this.isPaused = true;
    }
  }

  /** Resume recording */
  resume(): void {
    if (this.mediaRecorder?.state === "paused") {
      this.mediaRecorder.resume();
      this.startTime = performance.now() - this.pausedElapsed * 1000;
      this.isPaused = false;
    }
  }

  /** Stop recording and return the final video blob */
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob([], { type: "video/webm" }));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || "video/webm" });
        this.chunks = [];
        resolve(blob);
      };

      if (
        this.mediaRecorder.state === "recording" ||
        this.mediaRecorder.state === "paused"
      ) {
        this.mediaRecorder.stop();
      } else {
        resolve(new Blob([], { type: "video/webm" }));
      }
    });
  }

  /** Destroy the engine, stop everything, free resources */
  destroy(): void {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    if (
      this.mediaRecorder &&
      (this.mediaRecorder.state === "recording" ||
        this.mediaRecorder.state === "paused")
    ) {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.videoEl.pause();
    this.videoEl.srcObject = null;
  }

  /** Update the template (e.g. user switches template mid-preview) */
  setTemplate(template: DiaryTemplate | null): void {
    this.config.template = template;
  }

  /** Update the title shown on overlay */
  setTitle(title: string): void {
    this.config.title = title;
  }

  /** Get current elapsed recording time in seconds */
  getElapsed(): number {
    if (this.isPaused) return this.pausedElapsed;
    if (!this.startTime) return 0;
    return (performance.now() - this.startTime) / 1000;
  }

  /** The core render loop — draws webcam + overlay to canvas every frame */
  private renderLoop = (): void => {
    if (!this.isRunning) return;

    const { canvas } = this.config;
    const ctx = this.ctx;

    // Draw the webcam frame
    ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);

    // Draw template overlay on top
    if (this.config.template) {
      const elapsed = this.getElapsed();
      const frame: TemplateFrame = {
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now(),
        elapsed,
        isRecording: this.mediaRecorder?.state === "recording",
        title: this.config.title,
      };
      this.config.template.render(ctx, frame);

      // Update elapsed time callback
      if (this.mediaRecorder?.state === "recording") {
        this.config.onElapsedUpdate(elapsed);

        // Check max duration
        if (elapsed >= this.config.maxDuration) {
          this.config.onMaxDuration();
        }
      }
    } else if (this.mediaRecorder?.state === "recording") {
      const elapsed = this.getElapsed();
      this.config.onElapsedUpdate(elapsed);
      if (elapsed >= this.config.maxDuration) {
        this.config.onMaxDuration();
      }
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  /** Find the best supported WebM mime type */
  private getSupportedMimeType(): string {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "video/webm";
  }
}
