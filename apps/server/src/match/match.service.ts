import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { MatchId, PlayerId, SerializedGameState } from "@nexus/shared-types";
import { createInitialState, reduceAction, type RulesConfig } from "@nexus/game-engine";

type MatchRuntime = {
  id: MatchId;
  rules: RulesConfig;
  state: SerializedGameState;
  players: PlayerId[];
};

type QueueResult =
  | { kind: "queued"; queued: true }
  | { kind: "rejected"; queued: false }
  | { kind: "matched"; matchId: MatchId; players: [PlayerId, PlayerId]; mode: "casual" | "ranked" };

@Injectable()
export class MatchService {
  private readonly waiting: PlayerId[] = [];
  private readonly matches = new Map<MatchId, MatchRuntime>();
  private readonly playerToMatch = new Map<PlayerId, MatchId>();

  queue(playerId: PlayerId, mode: "casual" | "ranked"): QueueResult {
    if (this.playerToMatch.has(playerId)) return { kind: "rejected", queued: false };
    if (this.waiting.includes(playerId)) return { kind: "queued", queued: true };

    this.waiting.push(playerId);
    if (this.waiting.length < 2) return { kind: "queued", queued: true };

    const p1 = this.waiting.shift()!;
    const p2 = this.waiting.shift()!;
    const matchId = randomUUID();
    const rules: RulesConfig = {
      variant: "classic",
      players: [p1, p2],
      board: { width: 7, height: 6 },
      winCondition: { kind: "connect", n: 4 },
      gravity: "down",
    };
    const state = createInitialState(rules, "seed");
    const runtime: MatchRuntime = { id: matchId, rules, state, players: [p1, p2] };
    this.matches.set(matchId, runtime);
    this.playerToMatch.set(p1, matchId);
    this.playerToMatch.set(p2, matchId);
    return { kind: "matched", matchId, players: [p1, p2], mode };
  }

  leaveQueue(playerId: PlayerId) {
    const idx = this.waiting.indexOf(playerId);
    if (idx >= 0) this.waiting.splice(idx, 1);
  }

  getMatch(matchId: MatchId) {
    return this.matches.get(matchId) ?? null;
  }

  getMatchForPlayer(playerId: PlayerId) {
    const matchId = this.playerToMatch.get(playerId);
    return matchId ? this.matches.get(matchId) ?? null : null;
  }

  drop(matchId: MatchId, playerId: PlayerId, column: number) {
    const match = this.matches.get(matchId);
    if (!match) return null;

    const res = reduceAction(match.state, match.rules, { type: "DROP", player: playerId, column });
    match.state = res.state;
    return { state: match.state, events: res.events };
  }
}

