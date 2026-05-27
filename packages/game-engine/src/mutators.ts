import type { RulesConfig } from "./types.js";
import type { SerializedGameState } from "@nexus/shared-types";

export type MutatorContext = {
  rules: RulesConfig;
};

export type Mutator = {
  id: string;
  onTurnStart?: (state: SerializedGameState, ctx: MutatorContext) => SerializedGameState;
  onPieceDrop?: (
    state: SerializedGameState,
    ctx: MutatorContext,
    info: { column: number; player: string },
  ) => SerializedGameState;
  onWinConditionCheck?: (
    state: SerializedGameState,
    ctx: MutatorContext,
    info: { winner: string | null },
  ) => SerializedGameState;
};

export type MutatorRegistry = Map<string, Mutator>;

export function createMutatorRegistry(mutators: Mutator[]): MutatorRegistry {
  const reg: MutatorRegistry = new Map();
  for (const m of mutators) reg.set(m.id, m);
  return reg;
}

