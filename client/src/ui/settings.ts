/** Settings persisted to localStorage. */
const PREFIX = 'orbital_';

export class Settings {
  public playerName:       string  = 'Player';
  public mouseSensitivity: number  = 0.002;
  public matchSize:        5|10|20 = 5;

  public load(): void {
    this.playerName       = localStorage.getItem(PREFIX + 'player_name')   ?? `Player${Math.floor(Math.random() * 9000) + 1000}`;
    this.mouseSensitivity = Number(localStorage.getItem(PREFIX + 'sensitivity') ?? '0.002');
    const ms = Number(localStorage.getItem(PREFIX + 'match_size') ?? '5');
    this.matchSize = [5, 10, 20].includes(ms) ? ms as 5|10|20 : 5;
  }

  public save(): void {
    localStorage.setItem(PREFIX + 'player_name',  this.playerName);
    localStorage.setItem(PREFIX + 'sensitivity',  String(this.mouseSensitivity));
    localStorage.setItem(PREFIX + 'match_size',   String(this.matchSize));
  }

  public static getName(): string {
    return localStorage.getItem(PREFIX + 'player_name') ?? `Player${Math.floor(Math.random() * 9000) + 1000}`;
  }
}
