export interface SessionSettings {
  mouseSensitivity: number;
  musicVolume: number;
  soundtrackEnabled: boolean;
  sfxVolume: number;
  defaultCameraMode: "first" | "third";
}

export interface SessionMenuConfig {
  mainMenuLabel?: string | null;
  resumeLabel?: string | null;
  subtitle: string;
  title: string;
}

export const SESSION_MENU_GEAR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

const STORAGE_KEYS = {
  mouseSensitivity: "orbital_mouse_sensitivity",
  musicVolume: "orbital_music_volume",
  soundtrackEnabled: "orbital_soundtrack_enabled",
  sfxVolume: "orbital_sfx_volume",
  defaultCameraMode: "orbital_default_camera_mode",
} as const;

const DEFAULT_SETTINGS: SessionSettings = {
  mouseSensitivity: 0.002,
  soundtrackEnabled: true,
  musicVolume: 60,
  sfxVolume: 50,
  defaultCameraMode: "first",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap');

  .ob-session-launcher {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 420;
    display: none;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 16px;
    border-radius: 0;
    border: 1px solid rgba(127, 252, 255, 0.22);
    background: rgba(4, 9, 14, 0.82);
    color: #effcff;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    backdrop-filter: blur(12px);
    transition: border-color 0.2s, background 0.2s;
  }

  .ob-session-launcher:hover {
    border-color: rgba(127, 252, 255, 0.5);
    background: rgba(7, 15, 28, 0.92);
  }

  .ob-session-root {
    position: fixed;
    inset: 0;
    z-index: 430;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background:
      radial-gradient(circle at top, rgba(16, 36, 54, 0.74), rgba(3, 8, 14, 0.92) 56%, rgba(2, 4, 7, 0.98)),
      linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.6));
    color: #effcff;
    font-family: "Cormorant Garamond", serif;
  }

  .ob-session-root * {
    box-sizing: border-box;
  }

  .ob-session-panel {
    width: min(620px, calc(100vw - 36px));
    max-height: calc(100dvh - 36px);
    overflow: auto;
    border-radius: 0;
    border: 1px solid rgba(210, 220, 240, 0.16);
    background:
      radial-gradient(circle at top left, rgba(127, 252, 255, 0.07), rgba(127, 252, 255, 0) 30%),
      radial-gradient(circle at bottom right, rgba(255, 125, 248, 0.07), rgba(255, 125, 248, 0) 32%),
      rgba(5, 11, 17, 0.96);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(16px);
  }

  .ob-session-header,
  .ob-session-actions,
  .ob-session-settings {
    padding: 20px 22px;
  }

  .ob-session-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ob-session-kicker,
  .ob-session-subtitle,
  .ob-session-button,
  .ob-session-field-label,
  .ob-session-value,
  .ob-session-note,
  .ob-session-toggle-copy {
    font-family: "JetBrains Mono", monospace;
    text-transform: uppercase;
  }

  .ob-session-kicker {
    color: #8ea8ba;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
  }

  .ob-session-title {
    margin-top: 10px;
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 0.95;
    text-transform: uppercase;
  }

  .ob-session-subtitle {
    margin-top: 12px;
    color: #cfe3ed;
    font-size: 11px;
    letter-spacing: 0.12em;
    line-height: 1.7;
  }

  .ob-session-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ob-session-actions.ob-session-actions--single {
    grid-template-columns: minmax(0, 1fr);
  }

  .ob-session-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: relative;
    min-height: 50px;
    border-radius: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.03);
    color: #effcff;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-align: center;
    transition: border-color 0.2s, background 0.2s, transform 0.2s;
  }

  .ob-session-button:hover {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.06);
    transform: translateY(-1px);
  }

  .ob-session-button--resume {
    border-color: rgba(127, 252, 255, 0.28);
  }

  .ob-session-button--resume:hover {
    border-color: rgba(127, 252, 255, 0.55);
    color: oklch(0.88 0.12 210);
  }

  .ob-session-button--exit {
    border-color: rgba(255, 140, 160, 0.28);
  }

  .ob-session-button--exit:hover {
    border-color: rgba(255, 140, 160, 0.55);
    color: #ffb1c0;
  }

  .ob-session-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ob-session-settings-card {
    border-radius: 0;
    border: 1px solid rgba(210, 220, 240, 0.08);
    background: rgba(255, 255, 255, 0.02);
    padding: 16px;
  }

  .ob-session-settings-title {
    font-family: "Cormorant Garamond", serif;
    font-size: 22px;
    font-weight: 300;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .ob-session-note {
    margin-top: 8px;
    color: #8ea8ba;
    font-size: 10px;
    letter-spacing: 0.12em;
    line-height: 1.6;
  }

  .ob-session-field + .ob-session-field {
    margin-top: 16px;
  }

  .ob-session-field-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .ob-session-field-label {
    color: #dffcff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .ob-session-value {
    color: #8ea8ba;
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .ob-session-range {
    width: 100%;
    margin-top: 10px;
    accent-color: #7ffcff;
  }

  .ob-session-toggle {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    margin-top: 10px;
    padding: 12px 14px;
    border-radius: 0;
    border: 1px solid rgba(210, 220, 240, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }

  .ob-session-toggle-copy {
    color: #cfe3ed;
    font-size: 10px;
    letter-spacing: 0.1em;
    line-height: 1.7;
  }

  .ob-session-checkbox {
    width: 20px;
    height: 20px;
    accent-color: #7ffcff;
  }

  .ob-session-select {
    width: 100%;
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 0;
    border: 1px solid rgba(210, 220, 240, 0.16);
    background: rgba(255, 255, 255, 0.04);
    color: #effcff;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    accent-color: #7ffcff;
    cursor: pointer;
  }

  .ob-session-select:focus {
    outline: 1px solid rgba(127, 252, 255, 0.4);
  }

  @media (max-width: 640px) {
    .ob-session-actions {
      grid-template-columns: 1fr;
    }

    .ob-session-launcher {
      top: 10px;
      right: 10px;
      font-size: 9px;
      min-height: 32px;
      padding: 0 12px;
    }

    .ob-session-root {
      padding: 10px;
      padding-top: calc(10px + env(safe-area-inset-top, 0px));
      padding-bottom: max(70px, calc(54px + env(safe-area-inset-bottom, 0px)));
      align-items: flex-start;
    }

    .ob-session-panel {
      width: 100%;
      max-height: calc(
        100dvh
        - (10px + env(safe-area-inset-top, 0px))
        - max(70px, calc(54px + env(safe-area-inset-bottom, 0px)))
      );
    }

    .ob-session-header,
    .ob-session-actions,
    .ob-session-settings {
      padding: 14px 16px;
    }
  }

  @media (max-height: 500px) {
    .ob-session-root {
      padding: 8px;
      padding-top: calc(8px + env(safe-area-inset-top, 0px));
      padding-bottom: max(54px, calc(44px + env(safe-area-inset-bottom, 0px)));
      align-items: flex-start;
    }

    .ob-session-panel {
      max-height: calc(100dvh - (8px + env(safe-area-inset-top, 0px)) - max(54px, calc(44px + env(safe-area-inset-bottom, 0px))));
    }

    .ob-session-title {
      font-size: clamp(20px, 4vw, 30px);
    }

    .ob-session-header,
    .ob-session-actions,
    .ob-session-settings {
      padding: 10px 14px;
    }
  }
`;

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class SessionMenu {
  private readonly launcher: HTMLButtonElement;
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly mainMenuButton: HTMLButtonElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityValue: HTMLSpanElement;
  private readonly soundtrackInput: HTMLInputElement;
  private readonly soundtrackValue: HTMLSpanElement;
  private readonly musicInput: HTMLInputElement;
  private readonly musicValue: HTMLSpanElement;
  private readonly sfxInput: HTMLInputElement;
  private readonly sfxValue: HTMLSpanElement;
  private readonly cameraSelect: HTMLSelectElement;
  private settings = loadSettings();

  public onLauncherRequest: (() => void) | null = null;
  public onMainMenu: (() => void) | null = null;
  public onResume: (() => void) | null = null;
  public onSettingsChange: ((settings: SessionSettings) => void) | null = null;

  public constructor() {
    injectStyle();

    this.launcher = document.createElement("button");
    this.launcher.type = "button";
    this.launcher.className = "ob-session-launcher";
    this.launcher.setAttribute("aria-label", "Settings");
    this.launcher.innerHTML = SESSION_MENU_GEAR_ICON;
    this.launcher.addEventListener("click", () => this.onLauncherRequest?.());
    document.body.appendChild(this.launcher);

    this.root = document.createElement("div");
    this.root.className = "ob-session-root";
    this.root.innerHTML = `
      <div class="ob-session-panel">
        <div class="ob-session-header">
          <div class="ob-session-kicker">Session Menu</div>
          <div id="session-menu-title" class="ob-session-title"></div>
          <div id="session-menu-subtitle" class="ob-session-subtitle"></div>
        </div>

        <div class="ob-session-actions">
          <button id="session-menu-resume" type="button" class="ob-session-button ob-session-button--resume"></button>
          <button id="session-menu-main" type="button" class="ob-session-button ob-session-button--exit"></button>
        </div>

        <div class="ob-session-settings">
          <section class="ob-session-settings-card">
            <div class="ob-session-settings-title">Flight Settings</div>
            <div class="ob-session-note">Changes apply immediately. Soundtrack toggle mutes music while preserving the level setting.</div>

            <div class="ob-session-field">
              <div class="ob-session-field-head">
                <span class="ob-session-field-label">Mouse Sensitivity</span>
                <span id="session-menu-sensitivity-value" class="ob-session-value"></span>
              </div>
              <input id="session-menu-sensitivity" class="ob-session-range" type="range" min="5" max="40" step="1" />
            </div>

            <div class="ob-session-field">
              <div class="ob-session-field-head">
                <span class="ob-session-field-label">Soundtrack</span>
                <span id="session-menu-soundtrack-value" class="ob-session-value"></span>
              </div>
              <label class="ob-session-toggle">
                <span class="ob-session-toggle-copy">Keep the soundtrack channel armed once the music pass lands.</span>
                <input id="session-menu-soundtrack" class="ob-session-checkbox" type="checkbox" />
              </label>
            </div>

            <div class="ob-session-field">
              <div class="ob-session-field-head">
                <span class="ob-session-field-label">Music Level</span>
                <span id="session-menu-music-value" class="ob-session-value"></span>
              </div>
              <input id="session-menu-music" class="ob-session-range" type="range" min="0" max="100" step="1" />
            </div>

            <div class="ob-session-field">
              <div class="ob-session-field-head">
                <span class="ob-session-field-label">SFX Level</span>
                <span id="session-menu-sfx-value" class="ob-session-value"></span>
              </div>
              <input id="session-menu-sfx" class="ob-session-range" type="range" min="0" max="100" step="1" />
            </div>

            <div class="ob-session-field">
              <div class="ob-session-field-head">
                <span class="ob-session-field-label">Default Camera</span>
              </div>
              <select id="session-menu-camera" class="ob-session-select">
                <option value="first">First Person</option>
                <option value="third">Third Person</option>
              </select>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.title = this.query("#session-menu-title");
    this.subtitle = this.query("#session-menu-subtitle");
    this.resumeButton = this.query("#session-menu-resume");
    this.mainMenuButton = this.query("#session-menu-main");
    this.sensitivityInput = this.query("#session-menu-sensitivity");
    this.sensitivityValue = this.query("#session-menu-sensitivity-value");
    this.soundtrackInput = this.query("#session-menu-soundtrack");
    this.soundtrackValue = this.query("#session-menu-soundtrack-value");
    this.musicInput = this.query("#session-menu-music");
    this.musicValue = this.query("#session-menu-music-value");
    this.sfxInput = this.query("#session-menu-sfx");
    this.sfxValue = this.query("#session-menu-sfx-value");
    this.cameraSelect = this.query("#session-menu-camera");

    this.resumeButton.addEventListener("click", () => this.onResume?.());
    this.mainMenuButton.addEventListener("click", () => this.onMainMenu?.());

    this.sensitivityInput.addEventListener("input", () => {
      this.settings.mouseSensitivity = Number(this.sensitivityInput.value) / 10000;
      this.persistSettings();
      this.renderSettings();
      this.onSettingsChange?.(this.getSettings());
    });
    this.soundtrackInput.addEventListener("change", () => {
      this.settings.soundtrackEnabled = this.soundtrackInput.checked;
      this.persistSettings();
      this.renderSettings();
      this.onSettingsChange?.(this.getSettings());
    });
    this.musicInput.addEventListener("input", () => {
      this.settings.musicVolume = Number(this.musicInput.value);
      this.persistSettings();
      this.renderSettings();
      this.onSettingsChange?.(this.getSettings());
    });
    this.sfxInput.addEventListener("input", () => {
      this.settings.sfxVolume = Number(this.sfxInput.value);
      this.persistSettings();
      this.renderSettings();
      this.onSettingsChange?.(this.getSettings());
    });
    this.cameraSelect.addEventListener("change", () => {
      this.settings.defaultCameraMode = this.cameraSelect.value === "third" ? "third" : "first";
      this.persistSettings();
      this.renderSettings();
      this.onSettingsChange?.(this.getSettings());
    });

    this.renderSettings();
  }

  public getSettings(): SessionSettings {
    return { ...this.settings };
  }

  public isOpen(): boolean {
    return this.root.style.display === "flex";
  }

  public open(config: SessionMenuConfig): void {
    this.title.textContent = config.title;
    this.subtitle.textContent = config.subtitle;

    if (config.resumeLabel) {
      this.resumeButton.style.display = "flex";
      this.resumeButton.textContent = config.resumeLabel;
    } else {
      this.resumeButton.style.display = "none";
    }

    if (config.mainMenuLabel) {
      this.mainMenuButton.style.display = "flex";
      this.mainMenuButton.textContent = config.mainMenuLabel;
    } else {
      this.mainMenuButton.style.display = "none";
    }

    const actions = this.root.querySelector<HTMLElement>(".ob-session-actions");
    actions?.classList.toggle(
      "ob-session-actions--single",
      !config.resumeLabel || !config.mainMenuLabel,
    );

    this.root.style.display = "flex";
  }

  public close(): void {
    this.root.style.display = "none";
  }

  public setLauncherVisible(visible: boolean): void {
    this.launcher.style.display = visible ? "inline-flex" : "none";
  }

  private persistSettings(): void {
    localStorage.setItem(STORAGE_KEYS.mouseSensitivity, String(this.settings.mouseSensitivity));
    localStorage.setItem(STORAGE_KEYS.musicVolume, String(this.settings.musicVolume));
    localStorage.setItem(STORAGE_KEYS.sfxVolume, String(this.settings.sfxVolume));
    localStorage.setItem(STORAGE_KEYS.defaultCameraMode, this.settings.defaultCameraMode);
  }

  private renderSettings(): void {
    this.sensitivityInput.value = String(Math.round(this.settings.mouseSensitivity * 10000));
    this.sensitivityValue.textContent = `${(this.settings.mouseSensitivity * 1000).toFixed(1)}x`;
    this.soundtrackInput.checked = this.settings.soundtrackEnabled;
    this.soundtrackValue.textContent = this.settings.soundtrackEnabled ? "On" : "Off";
    this.musicInput.value = String(this.settings.musicVolume);
    this.musicValue.textContent = `${Math.round(this.settings.musicVolume)}%`;
    this.sfxInput.value = String(this.settings.sfxVolume);
    this.sfxValue.textContent = `${Math.round(this.settings.sfxVolume)}%`;
    this.cameraSelect.value = this.settings.defaultCameraMode;
  }

  private query<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector) as T;
  }
}

function loadSettings(): SessionSettings {
  const sensitivity = Number(localStorage.getItem(STORAGE_KEYS.mouseSensitivity) ?? DEFAULT_SETTINGS.mouseSensitivity);
  // Always default music to ON — never persist "off" state across sessions.
  // Stale "0" values from prior sessions would silently gate all audio on mobile.
  localStorage.removeItem(STORAGE_KEYS.soundtrackEnabled);
  const musicVolume = Number(localStorage.getItem(STORAGE_KEYS.musicVolume) ?? DEFAULT_SETTINGS.musicVolume);
  const sfxVolume = Number(localStorage.getItem(STORAGE_KEYS.sfxVolume) ?? DEFAULT_SETTINGS.sfxVolume);
  const savedCameraMode = localStorage.getItem(STORAGE_KEYS.defaultCameraMode);

  return {
    mouseSensitivity: Number.isFinite(sensitivity) ? clamp(sensitivity, 0.0005, 0.004) : DEFAULT_SETTINGS.mouseSensitivity,
    soundtrackEnabled: true,
    musicVolume: Number.isFinite(musicVolume) ? clamp(musicVolume, 0, 100) : DEFAULT_SETTINGS.musicVolume,
    sfxVolume: Number.isFinite(sfxVolume) ? clamp(sfxVolume, 0, 100) : DEFAULT_SETTINGS.sfxVolume,
    defaultCameraMode: savedCameraMode === "third" ? "third" : "first",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
