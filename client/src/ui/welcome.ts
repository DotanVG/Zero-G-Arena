import type { GlobalCursor } from './globalCursor';
import {
  injectWelcomeStyle,
  createWelcomeView,
  startWelcomeEffects,
} from './welcome/welcomeView';

export class WelcomeScreen {
  public onBreach: (() => void) | null = null;

  private root: HTMLDivElement | null = null;
  private stopEffects: (() => void) | null = null;
  private active = false;

  constructor(private readonly cursor: GlobalCursor) {}

  show(): void {
    this.hide();
    injectWelcomeStyle();
    const { root, layer, btn } = createWelcomeView();
    this.root = root;
    this.active = true;
    this.stopEffects = startWelcomeEffects(root, layer, btn);

    btn.addEventListener('mouseenter', () => this.cursor.setHot(true));
    btn.addEventListener('mouseleave', () => this.cursor.setHot(false));
    btn.addEventListener('click', () => {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        'requestPermission' in DeviceOrientationEvent &&
        typeof (DeviceOrientationEvent as { requestPermission?: () => Promise<string> }).requestPermission === 'function'
      ) {
        (DeviceOrientationEvent as { requestPermission: () => Promise<string> })
          .requestPermission()
          .catch(() => {});
      }
      this.fadeOut(() => {
        this.hide();
        this.onBreach?.();
      });
    });
  }

  fadeOut(cb: () => void): void {
    if (!this.root) { cb(); return; }
    const root = this.root;
    root.addEventListener('animationend', () => cb(), { once: true });
    root.classList.add('wc-fadeout');
  }

  hide(): void {
    this.stopEffects?.();
    this.stopEffects = null;
    this.root?.remove();
    this.root = null;
    this.active = false;
  }

  isVisible(): boolean {
    return this.active;
  }
}
