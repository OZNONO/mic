export const VOLUME_THRESHOLD = 0.025;
export const MIN_SILENCE_DURATION_MS = 1000;

export class AudioAnalyzer {
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate;
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.frameId = null;
    this.active = false;
    this.resetMetrics();
  }

  resetMetrics() {
    this.startedAt = 0;
    this.lastSampleAt = 0;
    this.voiceDurationMs = 0;
    this.silenceDurationMs = 0;
    this.currentSilenceMs = 0;
    this.silenceCount = 0;
    this.silenceCounted = false;
    this.volumeSamples = [];
  }

  async start(stream) {
    this.active = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    await this.closeContext();
    this.resetMetrics();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !stream) return false;

    try {
      this.context = new AudioContextClass();
      if (this.context.state === "suspended") await this.context.resume();
      this.source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.35;
      this.source.connect(this.analyser);
      this.data = new Float32Array(this.analyser.fftSize);
      this.startedAt = performance.now();
      this.lastSampleAt = this.startedAt;
      this.active = true;
      this.sample();
      return true;
    } catch (error) {
      console.warn("오디오 분석을 시작하지 못했습니다.", error);
      await this.closeContext();
      return false;
    }
  }

  sample = () => {
    if (!this.active || !this.analyser) return;

    const now = performance.now();
    const elapsed = Math.min(now - this.lastSampleAt, 150);
    this.lastSampleAt = now;
    this.analyser.getFloatTimeDomainData(this.data);

    let sumSquares = 0;
    for (const value of this.data) sumSquares += value * value;
    const rms = Math.sqrt(sumSquares / this.data.length);
    const volumePercent = Math.min(100, Math.round(rms * 450));
    const isVoice = rms >= VOLUME_THRESHOLD;

    this.volumeSamples.push(volumePercent);
    if (isVoice) {
      this.voiceDurationMs += elapsed;
      this.currentSilenceMs = 0;
      this.silenceCounted = false;
    } else {
      this.silenceDurationMs += elapsed;
      this.currentSilenceMs += elapsed;
      if (this.currentSilenceMs >= MIN_SILENCE_DURATION_MS && !this.silenceCounted) {
        this.silenceCount += 1;
        this.silenceCounted = true;
      }
    }

    this.onUpdate?.({ volumePercent, isVoice, silenceCount: this.silenceCount });
    this.frameId = requestAnimationFrame(this.sample);
  };

  getMetrics() {
    const samples = this.volumeSamples;
    const averageVolume = samples.length
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : 0;
    const variance = samples.length
      ? samples.reduce((sum, value) => sum + (value - averageVolume) ** 2, 0) / samples.length
      : 0;

    return {
      voiceDurationMs: Math.round(this.voiceDurationMs),
      silenceDurationMs: Math.round(this.silenceDurationMs),
      silenceCount: this.silenceCount,
      averageVolume: Math.round(averageVolume),
      volumeVariation: Math.round(Math.sqrt(variance))
    };
  }

  stop() {
    const metrics = this.getMetrics();
    this.active = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.closeContext();
    return metrics;
  }

  async closeContext() {
    const source = this.source;
    const context = this.context;
    this.source = null;
    this.analyser = null;
    this.context = null;
    try { source?.disconnect(); } catch (_) { /* already disconnected */ }
    if (context && context.state !== "closed") {
      try { await context.close(); } catch (_) { /* browser cleanup */ }
    }
  }
}
