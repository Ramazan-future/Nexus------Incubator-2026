export type PlayerId = string;
export type MatchId = string;

export type Vec2 = { x: number; y: number };

export type BoardSize = { width: number; height: number };

export type CellId = string; // `${x},${y}` for sparse boards

export type Piece = {
  id: string;
  owner: PlayerId;
  kind: "token";
};

export type SerializedGameState = {
  tick: number;
  rngSeed: string;
  board: {
    size: BoardSize | { kind: "infinite" };
    cells: Record<CellId, Piece | null>;
  };
  turn: {
    order: PlayerId[];
    active: PlayerId;
    moveNumber: number;
  };
  meta: Record<string, unknown>;
};

export type GameEvent =
  | { type: "TurnStarted"; player: PlayerId; tick: number }
  | { type: "PieceDropped"; player: PlayerId; column: number; tick: number }
  | { type: "WinChecked"; winner: PlayerId | null; tick: number }
  | { type: "GameEnded"; winner: PlayerId | null; tick: number }
  | { type: "MutatorApplied"; mutatorId: string; tick: number };

export type ClientToServerEvents = {
  "match:queue": (payload: { mode: "casual" | "ranked"; region?: string }) => void;
  "match:leaveQueue": () => void;
  "match:join": (payload: { matchId: MatchId }) => void;
  "game:action": (payload: { matchId: MatchId; action: unknown }) => void;
};

export type ServerToClientEvents = {
  "match:queued": (payload: { queued: true }) => void;
  "match:found": (payload: { matchId: MatchId }) => void;
  "match:state": (payload: { matchId: MatchId; state: SerializedGameState }) => void;
  "match:event": (payload: { matchId: MatchId; event: GameEvent }) => void;
  "match:error": (payload: { message: string; code?: string }) => void;
};

