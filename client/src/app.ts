import * as THREE from "three";

import { Arena } from "./arena/arena";
import { CameraController } from "./camera";
import { InputManager } from "./input";
import { LocalPlayer } from "./player";
import { HUD } from "./render/hud";
import { SceneManager } from "./render/scene";

void THREE;

export class App {
  private sceneMgr: SceneManager;
  private input: InputManager;
  private cam: CameraController;
  private player: LocalPlayer;
  private arena: Arena;
  private hud: HUD;
  private lastTime = 0;

  public constructor() {
    this.sceneMgr = new SceneManager();
    this.input = new InputManager();
    this.cam = new CameraController(this.sceneMgr.getCamera());
    this.arena = new Arena(this.sceneMgr.getScene());
    this.player = new LocalPlayer(this.sceneMgr.getScene());
    this.hud = new HUD();
  }

  public start(): void {
    this.hud.showStart();

    document.addEventListener("click", () => {
      if (!this.input.isLocked()) {
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
        this.hud.hideStart();
      }
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.input.isLocked()) {
      const { dx, dy } = this.input.consumeMouseDelta();
      const roll = this.input.isRoll();

      this.cam.applyMouseDelta(
        dx,
        dy,
        (roll.right ? 1 : 0) - (roll.left ? 1 : 0),
        this.input.mouseSensitivity,
      );
      this.input.updateFireCooldown(dt);
      this.player.update(this.input, this.cam, this.arena, dt);
      this.cam.apply(this.player.getPosition());
      this.hud.update(
        { team0: this.player.getScore(), team1: 0 },
        this.player.state,
        this.player.getFrozenTimer(),
      );
    }

    this.sceneMgr.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}
