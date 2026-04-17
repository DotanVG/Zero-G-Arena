import type { DamageState, EnemyPlayerInfo, FullPlayerInfo } from '../../../shared/schema';
import { isTouchDevice } from '../platform';
import { createHudView, type HudElements } from './hud/hudView';
import { buildScoreboardHtml } from './hud/scoreboard';

const IS_MOBILE = isTouchDevice();

export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export interface HudState {
  score: { team0: number; team1: number };
  phase: GamePhase;
  countdown: number;
  roundTimeRemaining: number;
  playerPhase: string;
  launchPower: number;
  maxLaunchPower: number;
  nearBar: boolean;
  inBreach: boolean;
  damage: DamageState;
  tabHeld: boolean;
  ownTeam: FullPlayerInfo[];
  enemyTeam: EnemyPlayerInfo[];
  dt: number;
  team: 0 | 1;
}

export class HUD {
  private view: HudElements;
  private hitConfirmTeam: 0 | 1 = 0;
  private hitConfirmTimer = 0;
  private isFirstRound = true;
  private prevPhase: GamePhase = 'LOBBY';
  private typewriterTimer = 0;
  private typewriterIdx = 0;
  private static readonly OBJECTIVE_TEXT =
    'Objective - Breach Enemy Portal or Freeze them ALL';

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

  public triggerHitConfirm(team: 0 | 1): void {
    this.hitConfirmTeam = team;
    this.hitConfirmTimer = 0.14;
  }

  public update(state: HudState): void {
    if (state.phase !== this.prevPhase) {
      if (this.prevPhase === 'ROUND_END' && state.phase === 'COUNTDOWN') {
        this.isFirstRound = false;
      }
      this.prevPhase = state.phase;
    }

    this.renderScore(state.phase, state.score);
    this.renderRoundTimer(state.phase, state.roundTimeRemaining);
    this.renderCountdown(state.phase, state.countdown);
    this.renderObjectiveTypewriter(state.phase, state.dt, state.team);
    this.renderCrosshair(state.dt);
    this.renderBreachIndicator(state.inBreach);
    this.renderGrabPrompt(state.playerPhase, state.nearBar, state.damage);
    this.renderPowerBar(state.playerPhase, state.launchPower, state.maxLaunchPower);
    this.renderDamage(state.damage);
    this.renderScoreboard(state.tabHeld, state.ownTeam, state.enemyTeam);
  }

  private renderScore(
    phase: GamePhase,
    score: { team0: number; team1: number },
  ): void {
    const show = phase !== 'LOBBY';
    this.view.scoreWrap.style.display = show ? 'flex' : 'none';
    if (!show) return;

    this.view.score.textContent = `${score.team0}  -  ${score.team1}`;
    this.view.scoreTeam0.style.opacity = '1';
    this.view.scoreTeam1.style.opacity = '1';
  }

  private renderRoundTimer(phase: GamePhase, roundTimeRemaining: number): void {
    const show = phase === 'COUNTDOWN' || phase === 'PLAYING';
    this.view.roundTimer.style.display = show ? 'block' : 'none';
    if (!show) return;

    const totalSeconds = Math.max(0, Math.ceil(roundTimeRemaining));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.view.roundTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private renderCountdown(phase: GamePhase, countdown: number): void {
    if (phase === 'COUNTDOWN' && countdown > 0) {
      this.view.countdown.style.display = 'block';
      this.view.countdown.textContent = String(Math.ceil(countdown));
    } else {
      this.view.countdown.style.display = 'none';
    }
  }

  private renderCrosshair(dt: number): void {
    this.hitConfirmTimer = Math.max(0, this.hitConfirmTimer - dt);
    const pulse = this.hitConfirmTimer > 0 ? this.hitConfirmTimer / 0.14 : 0;
    const glowColor = this.hitConfirmTeam === 0 ? '#00ffff' : '#ff00ff';
    const scale = 1 + pulse * 0.5;
    const size = 6 + pulse * 2;

    this.view.crosshair.style.width = `${size.toFixed(2)}px`;
    this.view.crosshair.style.height = `${size.toFixed(2)}px`;
    this.view.crosshair.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
    this.view.crosshair.style.background = pulse > 0 ? glowColor : '#ffffff';
    this.view.crosshair.style.opacity = pulse > 0 ? '1' : '0.85';
    this.view.crosshair.style.boxShadow = pulse > 0
      ? `0 0 ${12 + pulse * 10}px ${glowColor}`
      : '0 0 8px rgba(255,255,255,0.3)';
  }

  private renderObjectiveTypewriter(phase: GamePhase, dt: number, team: 0 | 1): void {
    const el = this.view.objective;
    if (this.isFirstRound && phase === 'COUNTDOWN') {
      const textColor = team === 0 ? '#aaffff' : '#ffaaff';
      const glowColor = team === 0 ? '#00ffff' : '#ff00ff';
      const backdropBg = team === 0 ? 'rgba(0,8,8,0.72)' : 'rgba(8,0,8,0.72)';

      el.style.color = textColor;
      el.style.textShadow = `0 0 12px ${glowColor}`;
      el.style.background = backdropBg;
      el.style.padding = '4px 14px';
      el.style.borderRadius = '4px';
      el.style.display = 'block';

      this.typewriterTimer += dt;
      const charsPerSecond = 20;
      this.typewriterIdx = Math.min(
        HUD.OBJECTIVE_TEXT.length,
        Math.floor(this.typewriterTimer * charsPerSecond),
      );
      el.textContent = HUD.OBJECTIVE_TEXT.slice(0, this.typewriterIdx);
    } else if (phase === 'PLAYING') {
      el.style.display = 'none';
      this.typewriterTimer = 0;
      this.typewriterIdx = 0;
    } else {
      el.style.display = 'none';
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
      if (!IS_MOBILE) {
        show = true;
        promptText = 'Pull mouse down to charge power - release [SPACE] to launch';
        el.style.fontSize = '14px';
        el.style.color = '#ffff88';
        el.style.textShadow = '0 0 8px #ffaa00';
      }
    } else if (playerPhase === 'GRABBING') {
      show = true;
      promptText = IS_MOBILE
        ? 'Hold LAUNCH and drag down to charge'
        : 'Hold [SPACE] to aim - [E] to release bar';
      el.style.fontSize = IS_MOBILE ? '13px' : '15px';
      el.style.color = '#aaffff';
      el.style.textShadow = '0 0 8px #00ffff';
    } else if (
      nearBar
      && (playerPhase === 'FLOATING' || playerPhase === 'BREACH')
      && !damage.leftArm
      && !damage.frozen
    ) {
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
    if (IS_MOBILE) {
      this.view.powerWrap.style.display = 'none';
      return;
    }

    const showBar = playerPhase === 'GRABBING' || playerPhase === 'AIMING';
    this.view.powerWrap.style.display = showBar ? 'block' : 'none';

    const pct = maxLaunchPower > 0 ? (launchPower / maxLaunchPower) * 100 : 0;
    this.view.powerBar.style.width = `${pct.toFixed(1)}%`;
    this.view.powerLabel.textContent = `POWER  ${Math.round(pct)}%`;
    const hue = 120 - pct * 1.2;
    this.view.powerBar.style.background = `hsl(${hue},90%,55%)`;
  }

  private renderDamage(damage: DamageState): void {
    const parts: string[] = [];
    if (damage.frozen) parts.push('FROZEN');
    if (damage.leftArm) parts.push('LEFT ARM - NO GRAB');
    if (damage.rightArm) parts.push('RIGHT ARM - NO FIRE');
    if (damage.legs) parts.push('LEGS - REDUCED POWER');
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
