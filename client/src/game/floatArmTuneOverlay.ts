import type { FloatArmTuningState } from '../player/playerAimPose';

/**
 * Dev-only overlay for live-tuning the float arm rotation.
 * Shown only when the floatArmTuning feature flag is on AND tuning is toggled (P).
 */
export class FloatArmTuneOverlay {
  private readonly element: HTMLDivElement;

  public constructor() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.right = '16px';
    overlay.style.bottom = '16px';
    overlay.style.zIndex = '30';
    overlay.style.maxWidth = '320px';
    overlay.style.padding = '10px 12px';
    overlay.style.border = '1px solid rgba(255, 200, 0, 0.5)';
    overlay.style.borderRadius = '8px';
    overlay.style.background = 'rgba(20, 12, 0, 0.82)';
    overlay.style.color = '#ffe080';
    overlay.style.font = '12px/1.45 monospace';
    overlay.style.whiteSpace = 'pre-line';
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    this.element = overlay;
  }

  public render(tuning: FloatArmTuningState, enabled: boolean, featureFlagOn: boolean): void {
    if (!featureFlagOn || !enabled) {
      this.element.style.display = 'none';
      return;
    }

    const { rotation } = tuning;
    const degX = (rotation.x * 180) / Math.PI;
    const degY = (rotation.y * 180) / Math.PI;
    const degZ = (rotation.z * 180) / Math.PI;

    this.element.style.display = 'block';
    this.element.textContent = [
      `${tuning.target} Tune: ON`,
      '',
      `Rotate  x:${rotation.x.toFixed(4)}  y:${rotation.y.toFixed(4)}  z:${rotation.z.toFixed(4)}`,
      `Deg     x:${degX.toFixed(1)}  y:${degY.toFixed(1)}  z:${degZ.toFixed(1)}`,
      '',
      'I/K J/L U/O: rotate',
      'Shift: fine step',
      'Enter: print value',
      'Backspace: reset to default',
      'P: close tuner',
    ].join('\n');
  }
}
