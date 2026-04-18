import * as THREE from "three";

const CANVAS_W = 256;
const CANVAS_H = 48;
const FONT = "bold 22px 'Share Tech Mono', monospace";
const TEAM_COLOR: [string, string] = ["#00ffff", "#ff44ff"];

export class PlayerNameTag {
  private readonly sprite: THREE.Sprite;
  private readonly texture: THREE.CanvasTexture;

  public constructor(name: string, team: 0 | 1, yOffset = 2.4) {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const ctx = canvas.getContext("2d")!;
    this.drawLabel(ctx, name, team);

    this.texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(CANVAS_W / CANVAS_H * 0.55, 0.55, 1);
    this.sprite.position.set(0, yOffset, 0);
    this.sprite.renderOrder = 999;
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

    // Background pill
    const pad = 10;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    const rr = CANVAS_H / 2;
    roundRect(ctx, pad / 2, 4, CANVAS_W - pad, CANVAS_H - 8, rr);
    ctx.fill();

    // Team-coloured text
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = TEAM_COLOR[team];
    ctx.shadowColor = TEAM_COLOR[team];
    ctx.shadowBlur = 8;
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
