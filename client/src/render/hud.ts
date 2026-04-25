import { MAX_LAUNCH_SPEED } from '../../../shared/constants';
import type { DamageState, EnemyPlayerInfo, FullPlayerInfo } from '../../../shared/schema';
import { isTouchDevice } from '../platform';
import { createHudView, type HudElements } from './hud/hudView';
import { buildScoreboardHtml } from './hud/scoreboard';
import type { TutorialPrompt } from './hud/tutorial';

const IS_MOBILE = isTouchDevice();

export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export function buildRoundEndHtml(
  result:
    | "tie"
    | { team: 0 | 1; kind?: "breach"; matchScore?: { team0: number; team1: number } }
    | { team: 0 | 1; kind: "freeze"; enemyTeam: 0 | 1; matchScore?: { team0: number; team1: number } },
): string {
  if (result === "tie") {
    return `<span class="ob-round-end__line"><span class="ob-round-end__text">TIE</span></span>`;
  }

  const teamHtml = buildRoundEndTeamSpan(result.team);

  if (result.matchScore) {
    return `<span class="ob-round-end__line">${teamHtml}<span class="ob-round-end__text">WINS</span><span class="ob-round-end__score">${result.matchScore.team0} - ${result.matchScore.team1}</span></span>`;
  }

  if (result.kind === "freeze") {
    return `<span class="ob-round-end__line">${teamHtml}<span class="ob-round-end__text">FROZE</span>${buildRoundEndTeamSpan(result.enemyTeam)}</span>`;
  }

  return `<span class="ob-round-end__line">${teamHtml}<span class="ob-round-end__text">BREACHED</span></span>`;
}

function buildRoundEndTeamSpan(team: 0 | 1): string {
  const teamLabel = team === 0 ? "CYAN" : "MAGENTA";
  const teamClass = team === 0
    ? "ob-round-end__team ob-round-end__team--cyan"
    : "ob-round-end__team ob-round-end__team--magenta";
  return `<span class="${teamClass}">${teamLabel}</span>`;
}

export interface HudState {
  score: { team0: number; team1: number };
  phase: GamePhase;
  countdown: number;
  roundTimeRemaining: number;
  playerPhase: string;
  launchPower: number;
  maxLaunchPower: number;
  nearBar: boolean;
  damage: DamageState;
  showPing: boolean;
  tabHeld: boolean;
  ownTeam: FullPlayerInfo[];
  enemyTeam: EnemyPlayerInfo[];
  tutorialPrompt: TutorialPrompt | null;
  helpVisible: boolean;
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

  public setVisible(visible: boolean): void {
    this.view.root.style.display = visible ? "block" : "none";
  }

  public showRoundEnd(message: string): void {
    this.view.roundEnd.innerHTML = message;
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
    this.renderGrabPrompt(state.playerPhase, state.nearBar, state.damage);
    this.renderPowerBar(state.playerPhase, state.launchPower, state.maxLaunchPower);
    this.renderDamage(state.damage);
    this.renderTutorial(state.phase, state.tutorialPrompt, state.team);
    this.renderScoreboard(state.tabHeld, state.ownTeam, state.enemyTeam, state.showPing, state.team);
    this.view.help.classList.toggle("ob-help-visible", state.helpVisible);
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

    // Bar uses absolute MAX_LAUNCH_SPEED as its 100% mark so leg damage shows
    // as a cap the player can *see* — the charge refuses to climb past the
    // wounded-leg fraction even though the bar is still scaled to full power.
    const denominator = MAX_LAUNCH_SPEED > 0 ? MAX_LAUNCH_SPEED : 1;
    const pct = (launchPower / denominator) * 100;
    const capPct = (maxLaunchPower / denominator) * 100;
    this.view.powerBar.style.width = `${pct.toFixed(1)}%`;
    this.view.powerLabel.textContent = capPct < 99.9
      ? `POWER  ${Math.round(pct)}% (CAP ${Math.round(capPct)}%)`
      : `POWER  ${Math.round(pct)}%`;
    const hue = 120 - pct * 1.2;
    this.view.powerBar.style.background = `hsl(${hue},90%,55%)`;
  }

  private renderDamage(damage: DamageState): void {
    const parts: Array<{ label: string; tone: "danger" | "warn" | "info" }> = [];
    if (damage.frozen) parts.push({ label: "FROZEN", tone: "danger" });
    if (damage.leftArm) parts.push({ label: "LEFT ARM OFFLINE", tone: "warn" });
    if (damage.rightArm) parts.push({ label: "RIGHT ARM OFFLINE", tone: "warn" });
    if (damage.leftLeg && damage.rightLeg) {
      parts.push({ label: "BOTH LEGS 50% LAUNCH", tone: "info" });
    } else if (damage.leftLeg) {
      parts.push({ label: "LEFT LEG 75% LAUNCH", tone: "info" });
    } else if (damage.rightLeg) {
      parts.push({ label: "RIGHT LEG 75% LAUNCH", tone: "info" });
    }

    this.view.damage.style.display = parts.length > 0 ? "flex" : "none";
    this.view.damage.innerHTML = parts
      .map((part) => `<span class="ob-damage-pill ob-damage-pill--${part.tone}">${part.label}</span>`)
      .join("");
  }

  private renderScoreboard(
    tabHeld: boolean,
    ownTeam: FullPlayerInfo[],
    enemyTeam: EnemyPlayerInfo[],
    showPing: boolean,
    team: 0 | 1,
  ): void {
    this.view.tab.style.display = tabHeld ? 'block' : 'none';
    if (tabHeld) {
      this.view.tab.innerHTML = buildScoreboardHtml(ownTeam, enemyTeam, {
        ownTeamId: team,
        showPing,
      });
    }
  }

  private renderTutorial(
    phase: GamePhase,
    prompt: TutorialPrompt | null,
    team: 0 | 1,
  ): void {
    const show = prompt !== null && (phase === "COUNTDOWN" || phase === "PLAYING");
    this.view.tutorial.style.display = show ? "block" : "none";
    if (!show || !prompt) return;

    this.view.tutorial.classList.toggle("ob-tutorial--cyan", team === 0);
    this.view.tutorial.classList.toggle("ob-tutorial--magenta", team === 1);
    this.view.tutorialStep.textContent = prompt.progress;
    this.view.tutorialTitle.textContent = prompt.title;
    this.view.tutorialBody.textContent = prompt.body;
  }
}
