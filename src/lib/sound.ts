class SoundFX {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq: number, duration = 0.08, type: OscillatorType = 'triangle', volume = 0.05): void {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Ignore audio errors when autoplay is blocked
    }
  }

  betPlaced(): void {
    this.playTone(520, 0.07, 'triangle', 0.05);
    setTimeout(() => this.playTone(660, 0.09, 'triangle', 0.05), 55);
  }

  pickUpdated(): void {
    this.playTone(587, 0.06, 'sine', 0.04);
  }

  roundWin(): void {
    this.playTone(523.25, 0.09, 'triangle', 0.06);
    setTimeout(() => this.playTone(659.25, 0.09, 'triangle', 0.06), 80);
    setTimeout(() => this.playTone(783.99, 0.16, 'triangle', 0.06), 160);
  }

  roundReveal(): void {
    this.playTone(440, 0.08, 'sine', 0.04);
  }
}

export const soundFx = new SoundFX();
