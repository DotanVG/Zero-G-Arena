import { createMenuView, injectMenuStyle, type MenuElements } from './menu/menuView';
import { isTouchDevice } from '../platform';
import { isMatchTeamSize, type MatchTeamSize } from '../../../shared/match';
import { validateCallSign } from '../../../shared/profanity';

const STORAGE_KEY = 'orbital_player_name';
const MATCH_SIZE_STORAGE_KEY = 'orbital_match_size';

export interface PlaySelection {
  name: string;
  noBots?: boolean;
  teamSize: MatchTeamSize;
}

export class MainMenu {
  private menu: MenuElements | null = null;
  private styleEl: HTMLStyleElement | null = null;

  public onPlaySolo: ((selection: PlaySelection) => void) | null = null;
  public onPlayOnline: ((selection: PlaySelection) => void) | null = null;
  public onOpenSettings: (() => void) | null = null;
  public onPlayTutorial: ((selection: PlaySelection) => void) | null = null;

  public show(): void {
    this.hide();
    if (!this.styleEl) {
      this.styleEl = injectMenuStyle();
    }

    const savedName = localStorage.getItem(STORAGE_KEY) ?? '';
    const savedSize = Number(localStorage.getItem(MATCH_SIZE_STORAGE_KEY) ?? '1');
    const elements = createMenuView(
      savedName,
      isMatchTeamSize(savedSize) ? savedSize : 1,
    );
    this.menu = elements;

    // Validate name on every keystroke
    elements.nameInput.addEventListener('input', () => {
      const v = elements.nameInput.value.trim();
      if (v) localStorage.setItem(STORAGE_KEY, v);
      this.validateName(elements);
    });
    elements.matchSizeSelect.addEventListener('change', () => {
      localStorage.setItem(MATCH_SIZE_STORAGE_KEY, elements.matchSizeSelect.value);
    });
    if (!isTouchDevice()) {
      elements.nameInput.focus();
    }

    elements.playSoloButton.addEventListener('click', () => {
      if (!this.checkNameBeforePlay(elements)) return;
      const selection = this.saveSelection();
      this.fadeOut(() => this.onPlaySolo?.(selection));
    });
    elements.playOnlineButton.addEventListener('click', () => {
      if (!this.checkNameBeforePlay(elements)) return;
      const selection = this.saveSelection();
      this.fadeOut(() => this.onPlayOnline?.(selection));
    });
    elements.openSettingsButton.addEventListener('click', () => {
      this.onOpenSettings?.();
    });
    elements.playTutorialButton.addEventListener('click', () => {
      if (!this.checkNameBeforePlay(elements)) return;
      const name = this.menu?.nameInput.value.trim() || 'Pilot';
      this.fadeOut(() => this.onPlayTutorial?.({ name, teamSize: 1, noBots: true }));
    });

    // Enter anywhere in the menu triggers PLAY SOLO (quickest path).
    // Using the root container so it also fires while the name input is focused.
    elements.root.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter') return;
      const target = ev.target;
      if (
        target instanceof HTMLElement
        && (target.closest('button') || target.closest('select'))
      ) {
        return;
      }
      ev.preventDefault();
      elements.playSoloButton.click();
    });
  }

  public hide(): void {
    this.menu?.container.remove();
    this.menu = null;
  }

  public fadeOut(cb?: () => void): void {
    const root = this.menu?.root;
    if (!root) { cb?.(); return; }
    root.style.transition = 'opacity 0.22s ease-out, transform 0.22s ease-out';
    root.style.opacity = '0';
    root.style.transform = 'translateY(-6px)';
    root.style.pointerEvents = 'none';
    setTimeout(() => { this.hide(); cb?.(); }, 240);
  }

  public isVisible(): boolean {
    return this.menu !== null;
  }

  public dispose(): void {
    this.hide();
    this.styleEl?.remove();
    this.styleEl = null;
  }

  private validateName(elements: MenuElements): string | null {
    const raw = elements.nameInput.value;
    // Empty field is fine until the player tries to submit
    if (raw.trim().length === 0) {
      elements.nameError.textContent = '';
      elements.nameInput.classList.remove('menu-input--error');
      return null;
    }
    const err = validateCallSign(raw);
    elements.nameError.textContent = err ?? '';
    elements.nameInput.classList.toggle('menu-input--error', err !== null);
    return err;
  }

  /** Returns true when the name is acceptable and play can proceed. */
  private checkNameBeforePlay(elements: MenuElements): boolean {
    const raw = elements.nameInput.value.trim();
    const nameForValidation = raw.length === 0 ? 'Pilot' : raw;
    const err = validateCallSign(nameForValidation);
    if (err) {
      elements.nameError.textContent = err;
      elements.nameInput.classList.add('menu-input--error');
      elements.nameInput.focus();
      return false;
    }
    elements.nameError.textContent = '';
    elements.nameInput.classList.remove('menu-input--error');
    return true;
  }

  private saveSelection(): PlaySelection {
    const name = this.menu?.nameInput.value.trim();
    const matchSizeValue = Number(this.menu?.matchSizeSelect.value ?? '1');
    const teamSize = isMatchTeamSize(matchSizeValue) ? matchSizeValue : 1;
    const finalName = name || 'Pilot';
    localStorage.setItem(STORAGE_KEY, finalName);
    localStorage.setItem(MATCH_SIZE_STORAGE_KEY, String(teamSize));
    return { name: finalName, teamSize };
  }
}
