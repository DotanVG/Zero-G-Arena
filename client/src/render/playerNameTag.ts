import * as THREE from "three";

const CANVAS_W = 320;
const CANVAS_H = 64;
const FONT = "bold 26px 'Share Tech Mono', monospace";
const TEAM_COLOR: [string, string] = ["#00ffff", "#ff44ff"];
const TEAM_BORDER: [string, string] = ["rgba(0,255,255,0.75)", "rgba(255,68,255,0.75)"];
const PILL_BG = "rgba(40,46,56,0.55)";

export class PlayerNameTag {
  private readonly sprite: THREE.Sprite;
  private readonly texture: THREE.CanvasTexture;

  public constructor(name: string, team: 0 | 1, yOffset = 1.15) {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const ctx = canvas.getContext("2d")!;
    this.drawLabel(ctx, name, team);

    this.texture = new THREE.CanvasTexture(canvas);

    // depthTest true + depthWrite false: the tag is occluded by arena
    // geometry (walls, obstacles) like the alien body it belongs to, so
    // you can't read enemy call signs through walls — but it doesn't
    // write depth itself, avoiding z-fighting against the helmet sprite.
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.sprite = new THREE.Sprite(material);
    // Keep world size similar to the previous tag — the larger canvas
    // gives sharper text without bloating billboard scale.
    this.sprite.scale.set(CANVAS_W / CANVAS_H * 0.55, 0.55, 1);
    this.sprite.position.set(0, yOffset, 0);
  }

  public getObject(): THREE.Sprite {
    return this.sprite;
  }

  public setVisible(visible: boolean): void {
    this.sprite.visible = visible;
  }

  public dispose(): void {
    this.sprite.material.dispose();
    this.texture.dispose();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, name: string, team: 0 | 1): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Semi-transparent grey rectangle background with a rounded corner
    // radius — keeps the pill soft while reading as "neutral backdrop"
    // so the team colour comes from the text and border, not the fill.
    const pad = 14;
    const rr = 10;
    const x = pad / 2;
    const y = 6;
    const w = CANVAS_W - pad;
    const h = CANVAS_H - 12;

    ctx.fillStyle = PILL_BG;
    roundRect(ctx, x, y, w, h, rr);
    ctx.fill();

    // Team-coloured neon border.
    ctx.lineWidth = 2;
    ctx.strokeStyle = TEAM_BORDER[team];
    ctx.shadowColor = TEAM_COLOR[team];
    ctx.shadowBlur = 10;
    roundRect(ctx, x, y, w, h, rr);
    ctx.stroke();

    // Team-coloured text with an outer glow — "bold neon" per design.
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = TEAM_COLOR[team];
    ctx.shadowColor = TEAM_COLOR[team];
    ctx.shadowBlur = 14;
    ctx.fillText(name, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W - pad * 3);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
