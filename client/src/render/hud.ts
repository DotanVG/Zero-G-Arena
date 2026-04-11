import type { DamageState, FullPlayerInfo, EnemyPlayerInfo } from '../../../shared/schema';

export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export class HUD {
  private el: HTMLDivElement;

  public constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      color: 'white',
      userSelect: 'none',
    });

    this.el.innerHTML = `
      <!-- Countdown (big centre) -->
      <div id="hud-countdown" style="
        display:none;position:absolute;left:50%;top:38%;
        transform:translate(-50%,-50%);font-size:90px;font-weight:bold;
        color:#fff;text-shadow:0 0 40px #00ffff;letter-spacing:0.05em;
      ">10</div>

      <!-- Crosshair -->
      <div id="hud-crosshair" style="
        position:absolute;left:50%;top:50%;
        transform:translate(-50%,-50%);
        width:6px;height:6px;border-radius:50%;background:#fff;opacity:0.85;
      "></div>

      <!-- Score (top centre) -->
      <div id="hud-score" style="
        position:absolute;left:50%;top:18px;
        transform:translateX(-50%);font-size:20px;letter-spacing:0.08em;
        text-shadow:0 0 10px rgba(0,255,255,0.5);
      ">0 — 0</div>

      <!-- Breach room indicator -->
      <div id="hud-breach" style="
        display:none;position:absolute;bottom:22px;left:50%;
        transform:translateX(-50%);font-size:13px;color:#88ddff;opacity:0.75;
      ">▼ BREACH ROOM — GRAVITY ACTIVE ▼</div>

      <!-- Grab prompt -->
      <div id="hud-grab" style="
        display:none;position:absolute;left:50%;bottom:28%;
        transform:translateX(-50%);font-size:17px;color:#aaffff;
        text-shadow:0 0 8px #00ffff;
      ">[E]  GRAB BAR</div>

      <!-- Launch power bar -->
      <div id="hud-power-wrap" style="
        display:none;position:absolute;left:50%;bottom:22%;
        transform:translateX(-50%);width:220px;
        background:rgba(0,0,0,0.45);padding:5px 7px;
        border:1px solid #00ffff;border-radius:5px;
      ">
        <div id="hud-power-bar" style="height:12px;width:0%;background:#00ffff;border-radius:3px;transition:none;"></div>
        <div id="hud-power-label" style="color:#cff;font-size:11px;text-align:center;margin-top:3px;">POWER  0%</div>
      </div>

      <!-- Damage indicators (bottom-left) -->
      <div id="hud-damage" style="
        position:absolute;left:20px;bottom:20px;font-size:13px;
        line-height:1.7;color:#ffaa00;
      "></div>

      <!-- Round end overlay -->
      <div id="hud-round-end" style="
        display:none;position:absolute;inset:0;
        display:none;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.6);font-size:52px;
        letter-spacing:0.08em;text-shadow:0 0 30px #fff;
      "></div>

      <!-- Tab scoreboard -->
      <div id="hud-tab" style="
        display:none;position:absolute;left:50%;top:50%;
        transform:translate(-50%,-50%);
        background:rgba(0,0,0,0.8);border:1px solid #334;
        padding:16px 24px;min-width:420px;font-size:13px;
        border-radius:6px;
      "></div>
    `;

    document.body.appendChild(this.el);
  }

  // ── Public API ────────────────────────────────────────────────────

  public showRoundEnd(message: string): void {
    const el = this.q<HTMLDivElement>('hud-round-end');
    if (el) {
      el.textContent = message;
      el.style.display = 'flex';
    }
  }

  public hideRoundEnd(): void {
    this.hide('hud-round-end');
  }

  public update(opts: {
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
  }): void {
    const {
      score, phase, countdown, playerPhase,
      launchPower, maxLaunchPower,
      nearBar, inBreach, damage,
      tabHeld, ownTeam, enemyTeam,
    } = opts;

    // Score
    const scoreEl = this.q<HTMLDivElement>('hud-score');
    if (scoreEl) {
      scoreEl.textContent = `${score.team0}  —  ${score.team1}`;
    }

    // Countdown
    const cdEl = this.q<HTMLDivElement>('hud-countdown');
    if (cdEl) {
      if (phase === 'COUNTDOWN' && countdown > 0) {
        cdEl.style.display = 'block';
        cdEl.textContent = String(Math.ceil(countdown));
      } else {
        cdEl.style.display = 'none';
      }
    }

    // Breach room label
    const breachEl = this.q<HTMLDivElement>('hud-breach');
    if (breachEl) {
      breachEl.style.display = inBreach ? 'block' : 'none';
    }

    // Contextual action prompt
    const grabEl = this.q<HTMLDivElement>('hud-grab');
    if (grabEl) {
      let promptText = '';
      let showPrompt = false;

      if (playerPhase === 'AIMING') {
        showPrompt = true;
        promptText = '↓ Pull mouse to charge power  ·  Release [SPACE] to launch';
        grabEl.style.fontSize = '14px';
        grabEl.style.color    = '#ffff88';
        grabEl.style.textShadow = '0 0 8px #ffaa00';
      } else if (playerPhase === 'GRABBING') {
        showPrompt = true;
        promptText = 'Hold [SPACE] to aim  ·  [E] to release bar';
        grabEl.style.fontSize = '15px';
        grabEl.style.color    = '#aaffff';
        grabEl.style.textShadow = '0 0 8px #00ffff';
      } else if (nearBar
        && (playerPhase === 'FLOATING' || playerPhase === 'BREACH')
        && !damage.leftArm && !damage.frozen) {
        showPrompt = true;
        promptText = '[E]  GRAB BAR';
        grabEl.style.fontSize = '17px';
        grabEl.style.color    = '#aaffff';
        grabEl.style.textShadow = '0 0 8px #00ffff';
      }

      grabEl.style.display  = showPrompt ? 'block' : 'none';
      if (showPrompt) grabEl.textContent = promptText;
    }

    // Power bar
    const wrapEl = this.q<HTMLDivElement>('hud-power-wrap');
    const barEl = this.q<HTMLDivElement>('hud-power-bar');
    const lblEl = this.q<HTMLDivElement>('hud-power-label');
    if (wrapEl && barEl && lblEl) {
      const showBar = playerPhase === 'GRABBING' || playerPhase === 'AIMING';
      wrapEl.style.display = showBar ? 'block' : 'none';
      const pct = maxLaunchPower > 0 ? (launchPower / maxLaunchPower) * 100 : 0;
      barEl.style.width = `${pct.toFixed(1)}%`;
      lblEl.textContent = `POWER  ${Math.round(pct)}%`;
      // Colour shift: green→yellow→red as power grows
      const hue = 120 - pct * 1.2;
      barEl.style.background = `hsl(${hue},90%,55%)`;
    }

    // Damage indicators
    const dmgEl = this.q<HTMLDivElement>('hud-damage');
    if (dmgEl) {
      const parts: string[] = [];
      if (damage.frozen) {
        parts.push('⬛ FROZEN');
      }
      if (damage.leftArm) {
        parts.push('🦾 LEFT ARM — NO GRAB');
      }
      if (damage.rightArm) {
        parts.push('🦾 RIGHT ARM — NO FIRE');
      }
      if (damage.legs) {
        parts.push('🦵 LEGS — REDUCED POWER');
      }
      dmgEl.innerHTML = parts.join('<br>');
    }

    // Tab scoreboard
    const tabEl = this.q<HTMLDivElement>('hud-tab');
    if (tabEl) {
      tabEl.style.display = tabHeld ? 'block' : 'none';
      if (tabHeld) {
        tabEl.innerHTML = this.buildScoreboard(ownTeam, enemyTeam);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private buildScoreboard(own: FullPlayerInfo[], enemy: EnemyPlayerInfo[]): string {
    const header = (cols: string[]) =>
      `<tr style="color:#88aacc;border-bottom:1px solid #334;">${cols.map((c) => `<th style="padding:2px 10px;text-align:left;">${c}</th>`).join('')}</tr>`;
    const ownRows = own.map((p) =>
      `<tr>
        <td style="padding:2px 10px;">${p.name}</td>
        <td style="padding:2px 10px;color:${p.frozen ? '#ff5555' : '#55ff55'}">${p.frozen ? 'FROZEN' : 'ACTIVE'}</td>
        <td style="padding:2px 10px;">${p.kills}</td>
        <td style="padding:2px 10px;">${p.deaths}</td>
        <td style="padding:2px 10px;">${p.ping}ms</td>
      </tr>`).join('');
    const enemyRows = enemy.map((p) =>
      `<tr>
        <td style="padding:2px 10px;">${p.name}</td>
        <td style="padding:2px 10px;">—</td>
        <td style="padding:2px 10px;">${p.kills}</td>
        <td style="padding:2px 10px;">${p.deaths}</td>
        <td style="padding:2px 10px;">${p.ping}ms</td>
      </tr>`).join('');

    return `<table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr><th colspan="5" style="color:#00ffff;font-size:14px;padding:4px 10px;text-align:left;">▲ OWN TEAM</th></tr>
        ${header(['Name', 'Status', 'K', 'D', 'Ping'])}
      </thead>
      <tbody>${ownRows}</tbody>
      <thead>
        <tr><th colspan="5" style="color:#ff55ff;font-size:14px;padding:8px 10px 4px;text-align:left;">▼ ENEMY TEAM</th></tr>
        ${header(['Name', '', 'K', 'D', 'Ping'])}
      </thead>
      <tbody>${enemyRows}</tbody>
    </table>`;
  }

  private q<T extends Element = Element>(id: string): T | null {
    return this.el.querySelector<T>(`#${id}`);
  }

  private show(id: string): void {
    const el = this.q<HTMLElement>(id);
    if (el) {
      el.style.display = 'flex';
    }
  }

  private hide(id: string): void {
    const el = this.q<HTMLElement>(id);
    if (el) {
      el.style.display = 'none';
    }
  }
}
