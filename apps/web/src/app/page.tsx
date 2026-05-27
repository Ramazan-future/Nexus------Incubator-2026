"use client";

import { useEffect, useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";

export default function Home() {
  const { connect, queue, drop, status, matchId, state } = useMatchStore();

  useEffect(() => {
    connect();
  }, [connect]);

  const size = useMemo(() => {
    const s = state?.board.size;
    if (!s || "kind" in s) return { width: 7, height: 6 };
    return s;
  }, [state]);

  const grid = useMemo(() => {
    const cells = state?.board.cells ?? {};
    const rows: Array<Array<"." | "X" | "O">> = [];
    for (let y = 0; y < size.height; y++) {
      const row: Array<"." | "X" | "O"> = [];
      for (let x = 0; x < size.width; x++) {
        const p = cells[`${x},${y}`];
        if (!p) row.push(".");
        else row.push(p.owner === state?.turn.order[0] ? "X" : "O");
      }
      rows.push(row);
    }
    return rows;
  }, [size.height, size.width, state]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-50">
      <main className="w-full max-w-4xl px-6 py-10 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connect4: Nexus — Phase 1</h1>
            <p className="text-sm text-zinc-400">
              Status: <span className="text-zinc-200">{status}</span>{" "}
              {matchId ? <span className="text-zinc-500">• match {matchId}</span> : null}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
              onClick={() => queue("casual")}
            >
              Queue Casual
            </button>
            <button
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
              onClick={() => queue("ranked")}
            >
              Queue Ranked
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {Array.from({ length: size.width }).map((_, i) => (
              <button
                key={i}
                className="rounded-md bg-zinc-800 px-3 py-2 text-xs hover:bg-zinc-700"
                onClick={() => drop(i)}
              >
                Drop {i + 1}
              </button>
            ))}
          </div>

          <pre className="text-xs leading-5 text-zinc-200 overflow-auto">
            {grid.map((r) => r.join(" ")).join("\n")}
          </pre>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-sm font-medium mb-2">Raw state</div>
          <pre className="text-xs text-zinc-300 overflow-auto max-h-72">
            {JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </main>
    </div>
  );
}
