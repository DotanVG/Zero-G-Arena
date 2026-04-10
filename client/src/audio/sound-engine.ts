/**
 * Synthesized Web Audio sound effects — no asset downloads required.
 * All sounds generated procedurally via the Web Audio API.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Call on first user interaction to unblock the AudioContext. */
  public resume(): void {
    this._ensure();
  }

  private _ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Brief laser chirp on fire */
  public playShoot(team: 0 | 1): void {
    const ctx = this._ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(team === 0 ? 1100 : 850, t);
    osc.frequency.exponentialRampToValueAtTime(team === 0 ? 450 : 340, t + 0.09);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.12);
  }

  /** Electronic zap + noise burst on freeze/hit */
  public playFreeze(): void {
    const ctx = this._ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    const sz  = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / sz) ** 2;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2800; filt.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    noise.connect(filt); filt.connect(ng); ng.connect(this.master);
    noise.start(t); noise.stop(t + 0.15);

    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
  }

  /** Ascending 3-note stinger — round start */
  public playRoundStart(): void {
    const ctx = this._ensure();
    if (!ctx || !this.master) return;
    const m = this.master;
    [440, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(m);
      osc.start(t); osc.stop(t + 0.25);
    });
  }

  /** 4-note fanfare — round end. win=true for ascending, false for descending */
  public playRoundEnd(win: boolean): void {
    const ctx = this._ensure();
    if (!ctx || !this.master) return;
    const m     = this.master;
    const notes = win ? [330, 440, 554, 660] : [660, 554, 440, 293];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.26, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g); g.connect(m);
      osc.start(t); osc.stop(t + 0.42);
    });
  }

  /** Rising sweep — portal breach */
  public playBreach(): void {
    const ctx = this._ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.28);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.5);
  }
}
