import * as THREE from "three";
import { HITBOX_OFFSET_Y, HITBOX_RADIUS } from "../../../shared/constants";
import type { OnlineActorSnapshot } from "../../../shared/multiplayer";
import { classifyHitZone, type HitZone } from "../../../shared/player-logic";
import type { PlayerPhase } from "../../../shared/schema";
import {
  predictPosition,
  reconcileAngle,
  reconcileVector,
} from "../net/reconciliation";
import { buildHudRosters } from "./rosterView";
import { SimulatedPlayerAvatar } from "./simulatedPlayerAvatar";

export interface OnlineProjectileTarget {
  id: string;
  pos: THREE.Vector3;
  team: 0 | 1;
  active: boolean;
  radius: number;
}

interface RemoteActorTrack {
  avatar: SimulatedPlayerAvatar;
  renderPos: THREE.Vector3;
  renderVel: THREE.Vector3;
  renderYaw: number;
  snapshot: OnlineActorSnapshot;
  receivedAtMs: number;
}

export class OnlineMatch {
  private tracks = new Map<string, RemoteActorTrack>();

  public constructor(private scene: THREE.Scene) {}

  public applySnapshot(actors: OnlineActorSnapshot[], localSessionId: string): void {
    const nowMs = performance.now();
    const incoming = new Set(actors.map((actor) => actor.id));

    for (const [id, track] of this.tracks) {
      if (incoming.has(id)) continue;
      track.avatar.dispose(this.scene);
      this.tracks.delete(id);
    }

    for (const actor of actors) {
      if (actor.id === localSessionId) continue;

      const snapshot = cloneSnapshot(actor);
      const existing = this.tracks.get(actor.id);
      if (!existing) {
        this.tracks.set(actor.id, {
          avatar: new SimulatedPlayerAvatar(this.scene, actor.team, actor.name),
          renderPos: new THREE.Vector3(actor.posX, actor.posY, actor.posZ),
          renderVel: new THREE.Vector3(actor.velX, actor.velY, actor.velZ),
          renderYaw: actor.yaw,
          snapshot,
          receivedAtMs: nowMs,
        });
        continue;
      }

      existing.snapshot = snapshot;
      existing.receivedAtMs = nowMs;

      // Big teleports or fresh respawns should land immediately so the avatar
      // never drags a stale predicted position across the arena.
      const authoritativePos = new THREE.Vector3(actor.posX, actor.posY, actor.posZ);
      if (
        existing.renderPos.distanceToSquared(authoritativePos) > 36
        || actor.phase === "RESPAWNING"
      ) {
        existing.renderPos.copy(authoritativePos);
        existing.renderVel.set(actor.velX, actor.velY, actor.velZ);
        existing.renderYaw = actor.yaw;
      }
    }
  }

  public update(dt: number): void {
    const nowMs = performance.now();

    for (const track of this.tracks.values()) {
      const authoritativePos = new THREE.Vector3(
        track.snapshot.posX,
        track.snapshot.posY,
        track.snapshot.posZ,
      );
      const authoritativeVel = new THREE.Vector3(
        track.snapshot.velX,
        track.snapshot.velY,
        track.snapshot.velZ,
      );
      const ageSeconds = (nowMs - track.receivedAtMs) / 1000;
      const shouldLead = track.snapshot.phase === "FLOATING" || track.snapshot.phase === "BREACH";
      const predictedPos = shouldLead
        ? predictPosition(authoritativePos, authoritativeVel, ageSeconds, 0.16)
        : authoritativePos;

      const previousPos = track.renderPos.clone();
      const sharpness = track.snapshot.phase === "FROZEN" ? 20 : 12;
      reconcileVector(track.renderPos, predictedPos, dt, sharpness, 3.5);
      track.renderYaw = reconcileAngle(track.renderYaw, track.snapshot.yaw, dt, 16);

      if (dt > 1e-5) {
        track.renderVel.copy(track.renderPos).sub(previousPos).multiplyScalar(1 / dt);
      } else {
        track.renderVel.set(0, 0, 0);
      }

      track.avatar.update(
        track.renderPos,
        {
          frozen: track.snapshot.frozen,
          leftArm: track.snapshot.leftArm,
          rightArm: track.snapshot.rightArm,
          leftLeg: track.snapshot.leftLeg,
          rightLeg: track.snapshot.rightLeg,
        },
        track.snapshot.phase as PlayerPhase,
        track.renderYaw,
        dt,
        track.renderVel.length(),
      );
    }
  }

  public triggerRemoteShot(actorId: string): void {
    this.tracks.get(actorId)?.avatar.triggerArmRecoil();
  }

  public classifyHitZone(actorId: string, impactPoint: THREE.Vector3): HitZone | null {
    const track = this.tracks.get(actorId);
    if (!track) return null;

    return classifyHitZone(
      {
        x: impactPoint.x,
        y: impactPoint.y,
        z: impactPoint.z,
      },
      {
        x: track.renderPos.x,
        y: track.renderPos.y,
        z: track.renderPos.z,
      },
      {
        x: -Math.sin(track.renderYaw),
        y: 0,
        z: -Math.cos(track.renderYaw),
      },
      HITBOX_OFFSET_Y,
      HITBOX_RADIUS,
    );
  }

  public getProjectileTargets(): OnlineProjectileTarget[] {
    return Array.from(this.tracks.values()).map((track) => ({
      id: track.snapshot.id,
      pos: new THREE.Vector3(
        track.renderPos.x,
        track.renderPos.y + HITBOX_OFFSET_Y,
        track.renderPos.z,
      ),
      team: track.snapshot.team,
      active: !track.snapshot.frozen && track.snapshot.phase !== "RESPAWNING",
      radius: HITBOX_RADIUS,
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
      ...Array.from(this.tracks.values()).map((track) => ({
        id: track.snapshot.id,
        name: track.snapshot.name,
        team: track.snapshot.team,
        isBot: track.snapshot.isBot,
        kills: track.snapshot.kills,
        deaths: track.snapshot.deaths,
        phase: track.snapshot.phase as PlayerPhase,
        frozen: track.snapshot.frozen,
        ping: 0,
      })),
    ];

    return buildHudRosters(localSessionId, localTeam, actors);
  }

  public dispose(): void {
    for (const track of this.tracks.values()) {
      track.avatar.dispose(this.scene);
    }
    this.tracks.clear();
  }
}

function cloneSnapshot(actor: OnlineActorSnapshot): OnlineActorSnapshot {
  return { ...actor };
}
