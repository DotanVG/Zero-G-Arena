import * as THREE from "three";
import { PLAYER_RADIUS } from "../../../shared/constants";
import type { OnlineActorSnapshot } from "../../../shared/multiplayer";
import type { PlayerPhase } from "../../../shared/schema";
import { buildHudRosters } from "./rosterView";
import { SimulatedPlayerAvatar } from "./simulatedPlayerAvatar";

export interface OnlineProjectileTarget {
  id: string;
  pos: THREE.Vector3;
  team: 0 | 1;
  active: boolean;
  radius: number;
}

export class OnlineMatch {
  private avatars = new Map<string, SimulatedPlayerAvatar>();
  private snapshots = new Map<string, OnlineActorSnapshot>();

  public constructor(private scene: THREE.Scene) {}

  public applySnapshot(actors: OnlineActorSnapshot[], localSessionId: string): void {
    const incoming = new Set(actors.map((a) => a.id));

    for (const id of this.avatars.keys()) {
      if (!incoming.has(id)) {
        this.avatars.get(id)?.dispose(this.scene);
        this.avatars.delete(id);
        this.snapshots.delete(id);
      }
    }

    for (const actor of actors) {
      if (actor.id === localSessionId) continue;

      if (!this.avatars.has(actor.id)) {
        this.avatars.set(actor.id, new SimulatedPlayerAvatar(this.scene, actor.team, actor.name));
      }
      this.snapshots.set(actor.id, actor);
    }
  }

  public update(dt: number): void {
    for (const [id, avatar] of this.avatars) {
      const snap = this.snapshots.get(id);
      if (!snap) continue;

      const pos = new THREE.Vector3(snap.posX, snap.posY, snap.posZ);
      avatar.update(
        pos,
        { frozen: snap.frozen, leftArm: snap.leftArm, rightArm: snap.rightArm, legs: snap.legs },
        snap.phase as PlayerPhase,
        snap.yaw,
        dt,
        0,
      );
    }
  }

  public getProjectileTargets(): OnlineProjectileTarget[] {
    return Array.from(this.snapshots.values()).map((snap) => ({
      id: snap.id,
      pos: new THREE.Vector3(snap.posX, snap.posY, snap.posZ),
      team: snap.team,
      active: !snap.frozen && snap.phase !== "RESPAWNING",
      radius: PLAYER_RADIUS,
    }));
  }

  public getHudRosters(
    localSessionId: string,
    localName: string,
    localTeam: 0 | 1,
    localKills: number,
    localDeaths: number,
    localFrozen: boolean,
    localPhase: PlayerPhase,
  ): ReturnType<typeof buildHudRosters> {
    const actors = [
      {
        id: localSessionId,
        name: localName,
        team: localTeam,
        isBot: false,
        kills: localKills,
        deaths: localDeaths,
        phase: localPhase,
        frozen: localFrozen,
        ping: 0,
      },
      ...Array.from(this.snapshots.values()).map((snap) => ({
        id: snap.id,
        name: snap.name,
        team: snap.team,
        isBot: snap.isBot,
        kills: snap.kills,
        deaths: snap.deaths,
        phase: snap.phase as PlayerPhase,
        frozen: snap.frozen,
        ping: 0,
      })),
    ];

    return buildHudRosters(localSessionId, localTeam, actors);
  }

  public dispose(): void {
    for (const avatar of this.avatars.values()) {
      avatar.dispose(this.scene);
    }
    this.avatars.clear();
    this.snapshots.clear();
  }
}
