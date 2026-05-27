import { create } from "zustand";
import type { GameEvent, MatchId, SerializedGameState } from "@nexus/shared-types";
import { getSocket } from "@/lib/socket";

type MatchStore = {
  status: "idle" | "queued" | "found" | "in_match";
  matchId: MatchId | null;
  state: SerializedGameState | null;
  events: GameEvent[];
  connect: () => void;
  queue: (mode: "casual" | "ranked") => void;
  drop: (column: number) => void;
};

export const useMatchStore = create<MatchStore>((set, get) => ({
  status: "idle",
  matchId: null,
  state: null,
  events: [],

  connect: () => {
    const socket = getSocket();
    socket.on("match:queued", () => set({ status: "queued" }));
    socket.on("match:found", ({ matchId }) => set({ status: "found", matchId }));
    socket.on("match:state", ({ matchId, state }) => set({ status: "in_match", matchId, state }));
    socket.on("match:event", ({ event }) =>
      set((s) => ({ events: [...s.events, event] })),
    );
    socket.on("match:error", ({ message }) => console.error("[match:error]", message));
  },

  queue: (mode) => {
    const socket = getSocket();
    socket.emit("match:queue", { mode });
  },

  drop: (column) => {
    const { matchId } = get();
    if (!matchId) return;
    const socket = getSocket();
    socket.emit("game:action", { matchId, action: { type: "DROP", column } });
  },
}));

