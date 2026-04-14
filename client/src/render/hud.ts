import type { DamageState, FullPlayerInfo, EnemyPlayerInfo } from '../../../shared/schema';
import { createHudView, type HudElements } from './hud/hudView';
import { buildScoreboardHtml } from './hud/scoreboard';

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
  dt: number;
  team: 0 | 1;
}

/**
 * HUD controller: owns the rendered HUD view and maps gameplay state into
 * DOM updates. Per-frame state (typewriter progress, phase tracking) is kept
 * here; everything else is derived from the incoming HudState each tick.
 */
export class HUD {
  private view: HudElements;

  // Typewriter state — only active during the very first countdown
  private isFirstRound = true;
  private prevPhase: GamePhase = 'LOBBY';
  private typewriterTimer = 0;
  private typewriterIdx = 0;
  private static readonly OBJECTIVE_TEXT =
    'Objective — Breach Enemy Portal or Freeze them ALL';

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
    // Track phase transitions to detect first-round vs subsequent rounds
    if (state.phase !== this.prevPhase) {
      if (this.prevPhase === 'ROUND_END' && state.phase === 'COUNTDOWN') {
        this.isFirstRound = false;
      }
      this.prevPhase = state.phase;
    }

    this.renderScore(state.score);
    this.renderCountdown(state.phase, state.countdown);
    this.renderObjectiveTypewriter(state.phase, state.dt, state.team);
    this.renderBreachIndicator(state.inBreach);
    this.renderGrabPrompt(state.playerPhase, state.nearBar, state.damage);
    this.renderPowerBar(state.playerPhase, state.launchPower, state.maxLaunchPower);
    this.renderDamage(state.damage);
    this.renderBodyStatus(state.damage, state.team);
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

  private renderObjectiveTypewriter(phase: GamePhase, dt: number, team: 0 | 1): void {
    const el = this.view.objective;
    if (this.isFirstRound && phase === 'COUNTDOWN') {
      // Team color: inverted against the same-colored portal/energy wall behind the text.
      // Dark backdrop + bright team-tint text ensures contrast regardless of background glow.
      const textColor  = team === 0 ? '#aaffff' : '#ffaaff';
      const glowColor  = team === 0 ? '#00ffff' : '#ff00ff';
      // Dark complement of the team hue so the background blocks the glow bleed
      const backdropBg = team === 0 ? 'rgba(0,8,8,0.72)' : 'rgba(8,0,8,0.72)';

      el.style.color      = textColor;
      el.style.textShadow = `0 0 12px ${glowColor}`;
      el.style.background = backdropBg;
      el.style.padding    = '4px 14px';
      el.style.borderRadius = '4px';
      el.style.display = 'block';

      this.typewriterTimer += dt;
      const CHARS_PER_SEC = 20;
      this.typewriterIdx = Math.min(
        HUD.OBJECTIVE_TEXT.length,
        Math.floor(this.typewriterTimer * CHARS_PER_SEC),
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
      show = true;
      promptText = '↓ Pull mouse to charge power  ·  Release [SPACE] to launch';
      el.style.fontSize = '14px';
      el.style.color = '#ffff88';
      el.style.textShadow = '0 0 8px #ffaa00';
    } else if (playerPhase === 'GRABBING') {
      show = true;
      promptText = 'Hold [SPACE] to aim  ·  [E] to release bar';
      el.style.fontSize = '15px';
      el.style.color = '#aaffff';
      el.style.textShadow = '0 0 8px #00ffff';
    } else if (
      nearBar
      && (playerPhase === 'FLOATING' || playerPhase === 'BREACH')
      && !damage.leftArm
      && !damage.frozen
    ) {
      show = true;
      promptText = '[E]  GRAB BAR';
      el.style.fontSize = '17px';
      el.style.color = '#aaffff';
      el.style.textShadow = '0 0 8px #00ffff';
    }

    el.style.display = show ? 'block' : 'none';
    if (show) el.textContent = promptText;
  }

  private renderPowerBar(
    playerPhase: string,
    launchPower: number,
    maxLaunchPower: number,
  ): void {
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

  /**
   * Updates the alien body-status silhouette on the left HUD panel.
   *
   * Fill colour = the ENEMY team colour (what's freezing you):
   *   cyan team (0)     → frozen parts fill magenta
   *   magenta team (1)  → frozen parts fill cyan
   *
   * Zone logic:
   *   frozen = true  → head + body fully frozen (whole silhouette filled)
   *   rightArm       → right-arm zone filled + red outline
   *   leftArm        → left-arm zone filled + red outline
   *   legs           → legs zone filled + red outline
   */
  private renderBodyStatus(damage: DamageState, team: 0 | 1): void {
    const enemyFill  = team === 0 ? 'rgba(255,0,255,0.62)' : 'rgba(0,255,255,0.62)';
    const hitStroke  = '#ff2200';
    const dimStroke  = 'rgba(255,255,255,0.28)';
    const hitWidth   = '2';
    const dimWidth   = '1.5';

    const applyZone = (
      el: SVGPathElement,
      active: boolean,
      outlined = active,
    ): void => {
      el.setAttribute('fill',         active   ? enemyFill  : 'none');
      el.setAttribute('stroke',       outlined ? hitStroke  : dimStroke);
      el.setAttribute('stroke-width', outlined ? hitWidth   : dimWidth);
    };

    applyZone(this.view.bzHead,     damage.frozen);
    applyZone(this.view.bzBody,     damage.frozen);
    applyZone(this.view.bzLeftArm,  damage.leftArm);
    applyZone(this.view.bzRightArm, damage.rightArm);
    applyZone(this.view.bzLegs,     damage.legs);
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
