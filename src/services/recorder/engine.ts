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
  private maxDurationFired: boolean = false;

  // Audio analysis for template visualizations
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioFrequencyData: Uint8Array<ArrayBuffer> | null = null;
  private audioLevel: number = 0;

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

    // Set up audio analysis if the stream has audio tracks
    const audioTracks = this.config.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      try {
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(this.config.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256; // 128 frequency bins — cheap and sufficient
        this.analyser.smoothingTimeConstant = 0.6;
        source.connect(this.analyser);
        // Do NOT connect analyser to destination — we don't want to play audio through speakers
        this.audioFrequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      } catch (e) {
        console.warn("[RecordingEngine] Failed to set up audio analysis:", e);
        // Non-fatal — templates will just get audioLevel=0 and null frequency data
      }
    }

    this.isRunning = true;
    this.renderLoop();
  }

  /** Start recording */
  start(): void {
    // H4: Guard against duplicate MediaRecorder
    if (this.mediaRecorder?.state === "recording") return;

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
    this.maxDurationFired = false;
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
    // Stop the render loop while in preview — no need to keep drawing
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob([], { type: "video/webm" }));
        return;
      }

      // H3: Timeout — resolve with whatever chunks we have if onstop never fires
      const timeout = setTimeout(() => {
        console.warn("[RecordingEngine] stop() timed out after 5s");
        const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || "video/webm" });
        this.chunks = [];
        resolve(blob);
      }, 5000);

      this.mediaRecorder.onstop = () => {
        clearTimeout(timeout);
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
        clearTimeout(timeout);
        resolve(new Blob([], { type: "video/webm" }));
      }
    });
  }

  /** Resume the canvas preview render loop (after stop/discard, before next recording) */
  resumePreview(): void {
    if (this.isRunning) return; // Already running
    this.mediaRecorder = null;
    this.startTime = 0;
    this.pausedElapsed = 0;
    this.isPaused = false;
    this.isRunning = true;
    this.renderLoop();
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

    // Clean up audio analysis resources
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.audioFrequencyData = null;
    this.audioLevel = 0;
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

    // Sample audio data for template visualizations
    this.sampleAudio();

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
        audioLevel: this.audioLevel,
        audioFrequencyData: this.audioFrequencyData,
      };
      this.config.template.render(ctx, frame);

      // Update elapsed time callback
      if (this.mediaRecorder?.state === "recording") {
        this.config.onElapsedUpdate(elapsed);

        // Check max duration (fire only once)
        if (!this.maxDurationFired && elapsed >= this.config.maxDuration) {
          this.maxDurationFired = true;
          this.config.onMaxDuration();
        }
      }
    } else if (this.mediaRecorder?.state === "recording") {
      const elapsed = this.getElapsed();
      this.config.onElapsedUpdate(elapsed);
      if (!this.maxDurationFired && elapsed >= this.config.maxDuration) {
        this.maxDurationFired = true;
        this.config.onMaxDuration();
      }
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  /** Sample audio frequency data and compute RMS level (called every frame) */
  private sampleAudio(): void {
    if (!this.analyser || !this.audioFrequencyData) {
      this.audioLevel = 0;
      return;
    }

    this.analyser.getByteFrequencyData(this.audioFrequencyData);

    // Compute RMS from frequency bins → normalize to 0-1
    let sum = 0;
    const data = this.audioFrequencyData;
    for (let i = 0; i < data.length; i++) {
      const normalized = data[i] / 255;
      sum += normalized * normalized;
    }
    this.audioLevel = Math.sqrt(sum / data.length);
  }

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
