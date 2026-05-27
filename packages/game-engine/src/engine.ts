import type { GameAction, RulesConfig } from "./types.js";
import type { MutatorRegistry } from "./mutators.js";
import type { PlayerId, SerializedGameState } from "@nexus/shared-types";

function cellId(x: number, y: number) {
  return `${x},${y}`;
}

export function createInitialState(rules: RulesConfig, rngSeed = "seed"): SerializedGameState {
  const order = [...rules.players];
  const active = order[0]!;

  const cells: Record<string, null> = {};
  for (let y = 0; y < rules.board.height; y++) {
    for (let x = 0; x < rules.board.width; x++) {
      cells[cellId(x, y)] = null;
    }
  }

  return {
    tick: 0,
    rngSeed,
    board: {
      size: { width: rules.board.width, height: rules.board.height },
      cells,
    },
    turn: {
      order,
      active,
      moveNumber: 1,
    },
    meta: {
      rules,
      winner: null,
      ended: false,
      mutators: [] as string[],
    },
  };
}

function nextPlayer(order: PlayerId[], active: PlayerId): PlayerId {
  const idx = order.indexOf(active);
  return order[(idx + 1) % order.length]!;
}

function applyGravityDropDown(
  state: SerializedGameState,
  rules: RulesConfig,
  player: PlayerId,
  column: number,
): { state: SerializedGameState; placedAt: { x: number; y: number } | null } {
  const size = state.board.size;
  if ("kind" in size) throw new Error("infinite board not supported in Phase 1 engine");
  if (column < 0 || column >= size.width) return { state, placedAt: null };

  for (let y = size.height - 1; y >= 0; y--) {
    const id = cellId(column, y);
    if (state.board.cells[id] === null) {
      const next = structuredClone(state) as SerializedGameState;
      next.board.cells[id] = { id: `p:${next.tick}:${column}:${y}`, owner: player, kind: "token" };
      return { state: next, placedAt: { x: column, y } };
    }
  }
  return { state, placedAt: null };
}

function checkConnectN(state: SerializedGameState, n: number): PlayerId | null {
  const size = state.board.size;
  if ("kind" in size) return null;

  const getOwner = (x: number, y: number) => state.board.cells[cellId(x, y)]?.owner ?? null;
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
  ];

  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const o = getOwner(x, y);
      if (!o) continue;
      for (const { dx, dy } of dirs) {
        let ok = true;
        for (let k = 1; k < n; k++) {
          const ox = x + dx * k;
          const oy = y + dy * k;
          if (ox < 0 || oy < 0 || ox >= size.width || oy >= size.height || getOwner(ox, oy) !== o) {
            ok = false;
            break;
          }
        }
        if (ok) return o;
      }
    }
  }
  return null;
}

export function reduceAction(
  state: SerializedGameState,
  rules: RulesConfig,
  action: GameAction,
  mutators?: MutatorRegistry,
): { state: SerializedGameState; events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  const ended = Boolean((state.meta as any).ended);
  if (ended) return { state, events };

  const tick = state.tick + 1;
  let next = structuredClone(state) as SerializedGameState;
  next.tick = tick;

  if (action.type === "DROP") {
    if (action.player !== next.turn.active) return { state, events };

    if (rules.gravity !== "down") {
      // Phase 1 engine supports standard gravity only; other modes will be added via mutators/physics.
      return { state, events };
    }

    const drop = applyGravityDropDown(next, rules, action.player, action.column);
    next = drop.state;
    if (!drop.placedAt) return { state, events };

    events.push({ type: "PieceDropped", player: action.player, column: action.column, tick });

    const winner =
      rules.winCondition.kind === "connect" ? checkConnectN(next, rules.winCondition.n) : null;
    events.push({ type: "WinChecked", winner, tick });

    if (winner) {
      (next.meta as any).winner = winner;
      (next.meta as any).ended = true;
      events.push({ type: "GameEnded", winner, tick });
      return { state: next, events };
    }

    next.turn.active = nextPlayer(next.turn.order, next.turn.active);
    next.turn.moveNumber += 1;
    events.push({ type: "TurnStarted", player: next.turn.active, tick });
    return { state: next, events };
  }

  if (action.type === "APPLY_MUTATOR") {
    // Phase 1: registry exists but mutator execution is minimal; this is a hook point.
    const reg = mutators?.get(action.mutatorId);
    if (!reg) return { state, events };
    const list = ((next.meta as any).mutators ?? []) as string[];
    if (!list.includes(action.mutatorId)) list.push(action.mutatorId);
    (next.meta as any).mutators = list;
    events.push({ type: "MutatorApplied", mutatorId: action.mutatorId, tick });
    return { state: next, events };
  }

  return { state, events };
}

