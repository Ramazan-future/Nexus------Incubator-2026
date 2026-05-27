import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@nexus/shared-types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
  socket = io(url, { transports: ["websocket"] });
  return socket;
}

