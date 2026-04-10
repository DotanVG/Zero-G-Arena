import type { DamageState, FullPlayerInfo, EnemyPlayerInfo } from '../../../shared/schema';

export type GamePhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END';

export class HUD {
  private el: HTMLDivElement;
  private isFirstRound = true;
  private objTypewriterIdx = 0;
  private objTypewriterTimer = 0;
  private prevPhase: GamePhase = 'LOBBY';
  private displayedPower = 0;
  private prevScoreStr = '';
  private prevDamageKey = '';
  private static readonly OBJECTIVE_TEXT = 'Objective — Breach Enemy Portal or Freeze them ALL';

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

    // Inject animation keyframes for HUD polish
    const style = document.createElement('style');
    style.textContent = `
      @keyframes scorePulse {
        0%   { filter: brightness(3) drop-shadow(0 0 10px #fff); }
        100% { filter: brightness(1) drop-shadow(0 0 0px transparent); }
      }
      @keyframes dmgFadeIn {
        from { opacity: 0; transform: translateX(-6px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes crosshairNear {
        0%,100% { box-shadow: 0 0 0px transparent; }
        50%     { box-shadow: 0 0 7px 2px #00ffff88; }
      }
      @keyframes roundEndIn {
        from { opacity: 0; transform: scale(1.18); }
        to   { opacity: 1; transform: scale(1); }
      }
      .score-pulse   { animation: scorePulse 0.4s ease-out; }
      .dmg-item      { display: inline-block; animation: dmgFadeIn 0.2s ease-out; }
      .crosshair-near { background: #00ffff !important; animation: crosshairNear 1s ease-in-out infinite; }
      .round-end-in  { animation: roundEndIn 0.45s cubic-bezier(0.22,1,0.36,1) both; }
    `;
    document.head.appendChild(style);

    this.el.innerHTML = `
      <!-- Countdown (big centre) -->
      <div id="hud-countdown" style="
        display:none;position:absolute;left:50%;top:38%;
        transform:translate(-50%,-50%);font-size:90px;font-weight:bold;
        color:#fff;text-shadow:0 0 40px #00ffff;letter-spacing:0.05em;
      ">10</div>

      <div id="hud-fade" style="
        display:block;position:absolute;inset:0;background:#04070d;opacity:0;
        transition:none;pointer-events:none;
      "></div>

      <!-- First-round objective typewriter -->
      <div id="hud-objective" style="
        display:none;position:absolute;left:50%;top:58%;
        transform:translateX(-50%);font-size:16px;letter-spacing:3px;
        color:#aaffff;text-shadow:0 0 12px #00ffff;text-align:center;
        max-width:600px;
      "></div>

      <!-- All-frozen countdown overlay -->
      <div id="hud-all-frozen" style="
        display:none;position:absolute;left:50%;top:26%;
        transform:translateX(-50%);font-size:18px;letter-spacing:4px;
        color:#ffff44;text-shadow:0 0 18px #ffcc00;text-align:center;
      "></div>

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
        align-items:center;justify-content:center;
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

  public showStart(): void {
    // Legacy no-op. Main menu owns the entry flow now.
  }

  public hideStart(): void {
    // Legacy no-op. Main menu owns the entry flow now.
  }

  public showRoundEnd(message: string): void {
    const el = this.q<HTMLDivElement>('hud-round-end');
    if (el) {
      el.textContent = message;
      el.style.display = 'flex';
      el.classList.remove('round-end-in');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('round-end-in');
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
    dt: number;
    allFrozenTeam?: 0 | 1;
    allFrozenTimer?: number;
  }): void {
    const {
      score, phase, countdown, playerPhase,
      launchPower, maxLaunchPower,
      nearBar, inBreach, damage,
      tabHeld, ownTeam, enemyTeam,
      dt, allFrozenTeam, allFrozenTimer,
    } = opts;

    // Score — pulse on change
    const scoreEl = this.q<HTMLDivElement>('hud-score');
    if (scoreEl) {
      const newStr = `${score.team0}  —  ${score.team1}`;
      if (newStr !== this.prevScoreStr) {
        this.prevScoreStr = newStr;
        scoreEl.textContent = newStr;
        scoreEl.classList.remove('score-pulse');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('score-pulse');
      }
    }

    // Phase transition tracking
    const phaseChanged = phase !== this.prevPhase;
    if (phaseChanged) {
      if (this.prevPhase === 'ROUND_END' && phase === 'COUNTDOWN') {
        this.isFirstRound = false;
      }
      this.prevPhase = phase;
    }

    // Countdown
    const cdEl = this.q<HTMLDivElement>('hud-countdown');
    const fadeEl = this.q<HTMLDivElement>('hud-fade');
    const objEl = this.q<HTMLDivElement>('hud-objective');
    if (cdEl) {
      if (phase === 'COUNTDOWN' && countdown >= 1) {
        cdEl.style.display = 'block';
        cdEl.textContent = String(Math.ceil(countdown));
      } else {
        cdEl.style.display = 'none';
      }
    }
    if (fadeEl) {
      if (this.isFirstRound && phase === 'COUNTDOWN') {
        // Start black, fade to transparent over the countdown duration
        const FADE_DURATION = 4.0;
        const elapsed = (5 - countdown);  // COUNTDOWN_SECONDS=5
        const opacity = Math.max(0, 1 - elapsed / FADE_DURATION);
        fadeEl.style.opacity = String(opacity);
      } else if (phase === 'PLAYING' || phase === 'ROUND_END') {
        fadeEl.style.opacity = '0';
      }
      // Non-first rounds: no fade
    }
    // Objective typewriter on first round countdown
    if (objEl) {
      if (this.isFirstRound && phase === 'COUNTDOWN') {
        objEl.style.display = 'block';
        const fullText = HUD.OBJECTIVE_TEXT;
        this.objTypewriterTimer += dt;
        const charsPerSec = 20;
        this.objTypewriterIdx = Math.min(
          fullText.length,
          Math.floor(this.objTypewriterTimer * charsPerSec),
        );
        objEl.textContent = fullText.slice(0, this.objTypewriterIdx);
      } else if (phase === 'PLAYING') {
        objEl.style.display = 'none';
        this.objTypewriterIdx = 0;
        this.objTypewriterTimer = 0;
      } else if (!this.isFirstRound) {
        objEl.style.display = 'none';
      }
    }

    // All-frozen overlay
    const allFrozenEl = this.q<HTMLDivElement>('hud-all-frozen');
    if (allFrozenEl) {
      if (allFrozenTeam !== undefined && allFrozenTimer !== undefined) {
        allFrozenEl.style.display = 'block';
        allFrozenEl.textContent = `ALL ENEMIES FROZEN — BREACH IN ${Math.ceil(allFrozenTimer)}s`;
      } else {
        allFrozenEl.style.display = 'none';
      }
    }

    // Crosshair — pulse when near a grabbable bar
    const crosshairEl = this.q<HTMLDivElement>('hud-crosshair');
    if (crosshairEl) {
      const nearActive = nearBar && !damage.leftArm && !damage.frozen
        && (playerPhase === 'FLOATING' || playerPhase === 'BREACH');
      crosshairEl.classList.toggle('crosshair-near', nearActive);
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
        promptText = 'Hold [SPACE] — charging launch  ·  Release to fire';
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

    // Power bar — lerped for smooth animation
    const wrapEl = this.q<HTMLDivElement>('hud-power-wrap');
    const barEl = this.q<HTMLDivElement>('hud-power-bar');
    const lblEl = this.q<HTMLDivElement>('hud-power-label');
    if (wrapEl && barEl && lblEl) {
      const showBar = playerPhase === 'GRABBING' || playerPhase === 'AIMING';
      wrapEl.style.display = showBar ? 'block' : 'none';
      const targetPct = maxLaunchPower > 0 ? (launchPower / maxLaunchPower) * 100 : 0;
      this.displayedPower += (targetPct - this.displayedPower) * Math.min(1, dt * 18);
      const pct = this.displayedPower;
      barEl.style.width = `${pct.toFixed(1)}%`;
      lblEl.textContent = `POWER  ${Math.round(pct)}%`;
      // Colour shift: green→yellow→red as power grows
      const hue = 120 - pct * 1.2;
      barEl.style.background = `hsl(${hue},90%,55%)`;
    }

    // Damage indicators — only rebuild DOM when state changes (fade-in on new items)
    const dmgEl = this.q<HTMLDivElement>('hud-damage');
    if (dmgEl) {
      const parts: string[] = [];
      if (damage.frozen)          parts.push('⬛ FROZEN');
      if (damage.leftArm)         parts.push('🦾 LEFT ARM — NO GRAB');
      if (damage.rightArm)        parts.push('🦾 RIGHT ARM — NO FIRE');
      if (damage.legs === 1)      parts.push('🦵 LEG HIT — −25% LAUNCH');
      else if (damage.legs >= 2)  parts.push('🦵 BOTH LEGS — −50% LAUNCH');
      const key = parts.join('|');
      if (key !== this.prevDamageKey) {
        this.prevDamageKey = key;
        dmgEl.innerHTML = parts
          .map(p => `<span class="dmg-item">${p}</span>`)
          .join('<br>');
      }
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
