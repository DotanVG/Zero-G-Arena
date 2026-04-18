import { MapSchema, Schema, defineTypes } from "@colyseus/schema";

export class LobbyMemberState extends Schema {
  public id = "";
  public sessionId = "";
  public name = "";
  public team: 0 | 1 = 0;
  public ready = false;
  public connected = true;
  public isBot = false;
}

export class ActorState extends Schema {
  public id = "";
  public name = "";
  public team: 0 | 1 = 0;
  public isBot = false;
  public posX = 0;
  public posY = 0;
  public posZ = 0;
  public velX = 0;
  public velY = 0;
  public velZ = 0;
  public yaw = 0;
  public phase = "BREACH";
  public frozen = false;
  public leftArm = false;
  public rightArm = false;
  public leftLeg = false;
  public rightLeg = false;
  public kills = 0;
  public deaths = 0;
  public frozenTimer = 0;
}

export class OrbitalLobbyState extends Schema {
  public phase = "LOBBY";
  public countdownRemaining = 0;
  public roundTimeRemaining = 0;
  public scoreTeam0 = 0;
  public scoreTeam1 = 0;
  public teamSize = 5;
  public roundNumber = 0;
  public members = new MapSchema<LobbyMemberState>();
  public actors = new MapSchema<ActorState>();
}

defineTypes(LobbyMemberState, {
  id: "string",
  sessionId: "string",
  name: "string",
  team: "number",
  ready: "boolean",
  connected: "boolean",
  isBot: "boolean",
});

defineTypes(ActorState, {
  id: "string",
  name: "string",
  team: "number",
  isBot: "boolean",
  posX: "number",
  posY: "number",
  posZ: "number",
  velX: "number",
  velY: "number",
  velZ: "number",
  yaw: "number",
  phase: "string",
  frozen: "boolean",
  leftArm: "boolean",
  rightArm: "boolean",
  leftLeg: "boolean",
  rightLeg: "boolean",
  kills: "number",
  deaths: "number",
  frozenTimer: "number",
});

defineTypes(OrbitalLobbyState, {
  phase: "string",
  countdownRemaining: "number",
  roundTimeRemaining: "number",
  scoreTeam0: "number",
  scoreTeam1: "number",
  teamSize: "number",
  roundNumber: "number",
  members: { map: LobbyMemberState },
  actors: { map: ActorState },
});
