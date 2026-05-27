import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, MatchId, ServerToClientEvents } from "@nexus/shared-types";
import { DropActionSchema } from "./match.types";
import { MatchService } from "./match.service";

type NexusSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type NexusServer = Server<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MatchGateway {
  @WebSocketServer()
  private readonly io!: NexusServer;

  constructor(private readonly matches: MatchService) {}

  @SubscribeMessage("match:queue")
  onQueue(
    @MessageBody() payload: { mode: "casual" | "ranked"; region?: string },
    @ConnectedSocket() socket: NexusSocket,
  ) {
    socket.emit("match:queued", { queued: true });
    const created = this.matches.queue(socket.id, payload.mode);
    if (created.kind !== "matched") return;

    const { matchId, players } = created;
    for (const pid of players) {
      this.io.sockets.sockets.get(pid)?.join(matchId);
      this.io.to(pid).emit("match:found", { matchId });
    }

    const m = this.matches.getMatch(matchId);
    if (m) this.io.to(matchId).emit("match:state", { matchId, state: m.state });
  }

  @SubscribeMessage("match:leaveQueue")
  onLeaveQueue(@ConnectedSocket() socket: NexusSocket) {
    this.matches.leaveQueue(socket.id);
  }

  @SubscribeMessage("match:join")
  onJoin(
    @MessageBody() payload: { matchId: MatchId },
    @ConnectedSocket() socket: NexusSocket,
  ) {
    socket.join(payload.matchId);
    const m = this.matches.getMatch(payload.matchId);
    if (m) socket.emit("match:state", { matchId: payload.matchId, state: m.state });
  }

  @SubscribeMessage("game:action")
  onAction(
    @MessageBody() payload: { matchId: MatchId; action: unknown },
    @ConnectedSocket() socket: NexusSocket,
  ) {
    const drop = DropActionSchema.safeParse(payload.action);
    if (!drop.success) {
      socket.emit("match:error", { message: "Invalid action", code: "BAD_ACTION" });
      return;
    }

    const res = this.matches.drop(payload.matchId, socket.id, drop.data.column);
    if (!res) {
      socket.emit("match:error", { message: "Match not found", code: "NO_MATCH" });
      return;
    }

    this.io.to(payload.matchId).emit("match:state", { matchId: payload.matchId, state: res.state });
    for (const e of res.events) {
      this.io.to(payload.matchId).emit("match:event", {
        matchId: payload.matchId,
        event: e as any,
      });
    }
  }
}

