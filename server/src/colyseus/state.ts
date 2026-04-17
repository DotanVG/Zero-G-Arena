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

export class OrbitalLobbyState extends Schema {
  public phase = "LOBBY";
  public countdownRemaining = 0;
  public roundTimeRemaining = 0;
  public scoreTeam0 = 0;
  public scoreTeam1 = 0;
  public teamSize = 5;
  public roundNumber = 0;
  public members = new MapSchema<LobbyMemberState>();
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

defineTypes(OrbitalLobbyState, {
  phase: "string",
  countdownRemaining: "number",
  roundTimeRemaining: "number",
  scoreTeam0: "number",
  scoreTeam1: "number",
  teamSize: "number",
  roundNumber: "number",
  members: { map: LobbyMemberState },
});
