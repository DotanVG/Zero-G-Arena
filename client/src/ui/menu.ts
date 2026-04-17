import { createMenuView, injectMenuStyle, type MenuElements } from './menu/menuView';
import { isTouchDevice } from '../platform';
import { isMatchTeamSize, type MatchTeamSize } from '../../../shared/match';

const STORAGE_KEY = 'orbital_player_name';
const MATCH_SIZE_STORAGE_KEY = 'orbital_match_size';

export interface PlaySelection {
  name: string;
  teamSize: MatchTeamSize;
}

/**
 * MainMenu controller: injects the style once, mounts/unmounts the view
 * element, wires up the play button + name-input persistence, and drives
 * the fade-out transition before handing off to the game.
 */
export class MainMenu {
  private menu: MenuElements | null = null;
  private styleEl: HTMLStyleElement | null = null;

  public onPlay: ((selection: PlaySelection) => void) | null = null;

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

    elements.nameInput.addEventListener('input', () => {
      const v = elements.nameInput.value.trim();
      if (v) localStorage.setItem(STORAGE_KEY, v);
    });
    elements.matchSizeSelect.addEventListener('change', () => {
      localStorage.setItem(MATCH_SIZE_STORAGE_KEY, elements.matchSizeSelect.value);
    });
    // Skip auto-focus on mobile to avoid unwanted virtual keyboard on load
    if (!isTouchDevice()) {
      elements.nameInput.focus();
    }

    elements.playButton.addEventListener('click', () => {
      const selection = this.saveSelection();
      this.fadeOut(() => this.onPlay?.(selection));
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
