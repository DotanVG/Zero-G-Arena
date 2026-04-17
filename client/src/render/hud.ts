import type { DamageState, FullPlayerInfo, EnemyPlayerInfo } from '../../../shared/schema';
import { createHudView, type HudElements } from './hud/hudView';
import { buildScoreboardHtml } from './hud/scoreboard';
import { isTouchDevice } from '../platform';

const IS_MOBILE = isTouchDevice();

export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export interface HudState {
  score: { team0: number; team1: number };
  phase: GamePhase;
  countdown: number;
  playerPhase: string;
  launchPower: number;
  maxLaunchPower: number;
  nearBar: boolean;
  inBreach: boolean;
  damage: DamageState;
  tabHeld: boolean;
  ownTeam: FullPlayerInfo[];
  enemyTeam: EnemyPlayerInfo[];
}

/**
 * HUD controller: owns the rendered HUD view and maps gameplay state into
 * DOM updates. Stateless apart from the cached element references — each
 * call to `update` overwrites every dynamic element from the incoming
 * HudState so state drift between frames is impossible.
 */
export class HUD {
  private view: HudElements;

  public constructor() {
    this.view = createHudView();
  }

  public showRoundEnd(message: string): void {
    this.view.roundEnd.textContent = message;
    this.view.roundEnd.style.display = 'flex';
  }

  public hideRoundEnd(): void {
    this.view.roundEnd.style.display = 'none';
  }

  public update(state: HudState): void {
    this.renderScore(state.score);
    this.renderCountdown(state.phase, state.countdown);
    this.renderBreachIndicator(state.inBreach);
    this.renderGrabPrompt(state.playerPhase, state.nearBar, state.damage);
    this.renderPowerBar(state.playerPhase, state.launchPower, state.maxLaunchPower);
    this.renderDamage(state.damage);
    this.renderScoreboard(state.tabHeld, state.ownTeam, state.enemyTeam);
  }

  private renderScore(score: { team0: number; team1: number }): void {
    this.view.score.textContent = `${score.team0}  —  ${score.team1}`;
  }

  private renderCountdown(phase: GamePhase, countdown: number): void {
    if (phase === 'COUNTDOWN' && countdown > 0) {
      this.view.countdown.style.display = 'block';
      this.view.countdown.textContent = String(Math.ceil(countdown));
    } else {
      this.view.countdown.style.display = 'none';
    }
  }

  private renderBreachIndicator(inBreach: boolean): void {
    this.view.breach.style.display = inBreach ? 'block' : 'none';
  }

  private renderGrabPrompt(
    playerPhase: string,
    nearBar: boolean,
    damage: DamageState,
  ): void {
    const el = this.view.grab;
    let promptText = '';
    let show = false;

    if (playerPhase === 'AIMING') {
      // On mobile the vertical power bar is sufficient — skip text prompt.
      if (!IS_MOBILE) {
        show = true;
        promptText = '↓ Pull mouse to charge power  ·  Release [SPACE] to launch';
        el.style.fontSize = '14px';
        el.style.color = '#ffff88';
        el.style.textShadow = '0 0 8px #ffaa00';
      }
    } else if (playerPhase === 'GRABBING') {
      show = true;
      promptText = IS_MOBILE
        ? 'Hold LAUNCH & drag ↓ to charge'
        : 'Hold [SPACE] to aim  ·  [E] to release bar';
      el.style.fontSize = IS_MOBILE ? '13px' : '15px';
      el.style.color = '#aaffff';
      el.style.textShadow = '0 0 8px #00ffff';
    } else if (
      nearBar
      && (playerPhase === 'FLOATING' || playerPhase === 'BREACH')
      && !damage.leftArm
      && !damage.frozen
    ) {
      // On mobile the GRAB button appears instead; skip this text.
      if (!IS_MOBILE) {
        show = true;
        promptText = '[E]  GRAB BAR';
        el.style.fontSize = '17px';
        el.style.color = '#aaffff';
        el.style.textShadow = '0 0 8px #00ffff';
      }
    }

    el.style.display = show ? 'block' : 'none';
    if (show) el.textContent = promptText;
  }

  private renderPowerBar(
    playerPhase: string,
    launchPower: number,
    maxLaunchPower: number,
  ): void {
    // On mobile the MobileControls vertical bar handles power display.
    if (IS_MOBILE) {
      this.view.powerWrap.style.display = 'none';
      return;
    }
    const showBar = playerPhase === 'GRABBING' || playerPhase === 'AIMING';
    this.view.powerWrap.style.display = showBar ? 'block' : 'none';

    const pct = maxLaunchPower > 0 ? (launchPower / maxLaunchPower) * 100 : 0;
    this.view.powerBar.style.width = `${pct.toFixed(1)}%`;
    this.view.powerLabel.textContent = `POWER  ${Math.round(pct)}%`;
    // Green → yellow → red as power grows.
    const hue = 120 - pct * 1.2;
    this.view.powerBar.style.background = `hsl(${hue},90%,55%)`;
  }

  private renderDamage(damage: DamageState): void {
    const parts: string[] = [];
    if (damage.frozen) parts.push('⬛ FROZEN');
    if (damage.leftArm) parts.push('🦾 LEFT ARM — NO GRAB');
    if (damage.rightArm) parts.push('🦾 RIGHT ARM — NO FIRE');
    if (damage.legs) parts.push('🦵 LEGS — REDUCED POWER');
    this.view.damage.innerHTML = parts.join('<br>');
  }

  private renderScoreboard(
    tabHeld: boolean,
    ownTeam: FullPlayerInfo[],
    enemyTeam: EnemyPlayerInfo[],
  ): void {
    this.view.tab.style.display = tabHeld ? 'block' : 'none';
    if (tabHeld) {
      this.view.tab.innerHTML = buildScoreboardHtml(ownTeam, enemyTeam);
    }
  }
}
