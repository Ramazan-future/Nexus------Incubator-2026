import type { PlayerId, SerializedGameState } from "@nexus/shared-types";

export type GameVariantId = "classic" | "sandbox";

export type WinCondition =
  | { kind: "connect"; n: 3 | 4 | 5 | 6 }
  | { kind: "square"; size: 2 | 3 }
  | { kind: "points"; target: number };

export type GravityMode = "down" | "up" | "left" | "right";

export type RulesConfig = {
  variant: GameVariantId;
  players: PlayerId[];
  board: { width: number; height: number };
  winCondition: WinCondition;
  gravity: GravityMode;
};

export type GameAction =
  | { type: "DROP"; player: PlayerId; column: number }
  | { type: "APPLY_MUTATOR"; player: PlayerId; mutatorId: string; payload?: unknown };

export type EngineResult = {
  state: SerializedGameState;
  events: Array<{ type: string; [k: string]: unknown }>;
};

