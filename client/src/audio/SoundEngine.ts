import * as THREE from 'three';

const AUDIO_URLS = {
  laser1: '/audio/laser-1.wav',
  laser2: '/audio/laser-2.wav',
  countdown: '/audio/countdown.wav',
  music: '/audio/main-theme.wav',
} as const;

// Positional audio: refDistance 5m, beyond which volume fades over 40m linearly.
const POS_REF_DISTANCE = 5;
const POS_MAX_DISTANCE = 40;

export class SoundEngine {
  private readonly listener: THREE.AudioListener;
  private readonly scene: THREE.Scene;

  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfx2dGain: GainNode | null = null;

  private buffers: {
    laser1: AudioBuffer | null;
    laser2: AudioBuffer | null;
    countdown: AudioBuffer | null;
    music: AudioBuffer | null;
  } = { laser1: null, laser2: null, countdown: null, music: null };

  private loadPromise: Promise<void> | null = null;
  private unlocked = false;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicEnabled = true;
  private musicVolumePct = 60;
  private sfxVolumePct = 50;
  private activeCountdownSource: AudioBufferSourceNode | null = null;
  private laserToggle = 0; // alternates 0/1 for laser1/laser2

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.scene = scene;
  }

  public async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.unlocked = true;

    const ctx = this.listener.context as AudioContext;
    this.ctx = ctx;

    this.musicGain = ctx.createGain();
    this.musicGain.connect(ctx.destination);

    this.sfx2dGain = ctx.createGain();
    this.sfx2dGain.connect(ctx.destination);

    this.applyMusicGain();
    this.applySfxGain();

    // Always resume — on iOS 13+ context starts 'running' but skipping resume
    // leaves audio gated behind the user-gesture policy for async src.start() calls.
    await ctx.resume();

    // Play a 1-frame silent buffer synchronously to satisfy iOS's "first playback
    // must originate from a user gesture" requirement before async buffer loads.
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const primer = ctx.createBufferSource();
    primer.buffer = silent;
    primer.connect(ctx.destination);
    primer.start();

    await this.loadBuffers();
  }

  public startMusic(): void {
    if (!this.ctx || !this.musicGain || !this.buffers.music) return;
    if (this.musicSource) return; // already playing

    if (!this.musicEnabled) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.music;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  public stopMusic(): void {
    if (!this.musicSource) return;
    try { this.musicSource.stop(); } catch { /* already stopped */ }
    this.musicSource = null;
  }

  public tryResumeMusic(): void {
    if (!this.ctx || !this.musicEnabled) return;
    void this.ctx.resume().then(() => {
      if (!this.musicSource) this.startMusic();
    });
  }

  public setMusicVolume(pct0to100: number): void {
    this.musicVolumePct = pct0to100;
    this.applyMusicGain();
  }

  public setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (on) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  public setSfxVolume(pct0to100: number): void {
    this.sfxVolumePct = pct0to100;
    this.applySfxGain();
  }

  public playLocalShot(): void {
    if (!this.ctx || !this.sfx2dGain) return;
    const buf = this.pickLaserBuffer();
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    src.connect(this.sfx2dGain);
    src.start();
  }

  public playRemoteShot(pos: THREE.Vector3): void {
    if (!this.buffers.laser1 && !this.buffers.laser2) return;
    const buf = this.pickLaserBuffer();
    if (!buf) return;

    // Anchor point at shot origin
    const anchor = new THREE.Object3D();
    anchor.position.copy(pos);
    this.scene.add(anchor);

    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buf);
    audio.setRefDistance(POS_REF_DISTANCE);
    audio.setMaxDistance(POS_MAX_DISTANCE);
    audio.setRolloffFactor(1);
    audio.setDistanceModel('linear');
    // Slight pitch variance
    if (audio.source) {
      (audio.source as AudioBufferSourceNode).playbackRate.value = 0.96 + Math.random() * 0.08;
    }
    anchor.add(audio);
    audio.play();

    audio.source?.addEventListener('ended', () => {
      anchor.remove(audio);
      this.scene.remove(anchor);
      audio.disconnect();
    });
  }

  public playCountdown(): void {
    if (!this.ctx || !this.sfx2dGain || !this.buffers.countdown) return;
    this.stopCountdown();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.countdown;
    src.connect(this.sfx2dGain);
    src.start();
    this.activeCountdownSource = src;
    src.addEventListener('ended', () => {
      if (this.activeCountdownSource === src) {
        this.activeCountdownSource = null;
      }
    });
  }

  public stopCountdown(): void {
    if (!this.activeCountdownSource) return;
    try { this.activeCountdownSource.stop(); } catch { /* already ended */ }
    this.activeCountdownSource = null;
  }

  private pickLaserBuffer(): AudioBuffer | null {
    const pick = this.laserToggle % 2 === 0 ? this.buffers.laser1 : this.buffers.laser2;
    this.laserToggle++;
    return pick;
  }

  private applyMusicGain(): void {
    if (!this.musicGain) return;
    this.musicGain.gain.value = (this.musicVolumePct / 100) * 0.8; // 0.8 headroom
  }

  private applySfxGain(): void {
    const v = (this.sfxVolumePct / 100) * 0.75;
    if (this.sfx2dGain) this.sfx2dGain.gain.value = v;
    this.listener.setMasterVolume(v);
  }

  private async loadBuffers(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const entries = Object.entries(AUDIO_URLS) as [keyof typeof AUDIO_URLS, string][];
      await Promise.all(
        entries.map(async ([key, url]) => {
          try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            this.buffers[key] = decoded;
          } catch (err) {
            console.warn(`[SoundEngine] Failed to load ${url}:`, err);
          }
        }),
      );
    })();

    return this.loadPromise;
  }
}
