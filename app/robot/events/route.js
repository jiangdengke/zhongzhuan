import {
  readRobotEventStatus,
  subscribeRobotEvents,
} from "@/features/robot/application/robot-events.js";
import { readActiveModelResponseSnapshots } from "@/features/robot/application/model-response.js";
import { createSseHeaders, encodeSseEvent } from "@/shared/http/sse.js";
import { logInfo, makeTraceId } from "@/shared/logging/logger.js";

export const dynamic = "force-dynamic";

function closeController(controller) {
  try {
    controller.close();
  } catch {
    // The client may have already closed the connection.
  }
}

export async function GET(request) {
  const connectionId = makeTraceId("sse");
  const connectedAt = Date.now();
  let unsubscribe = () => {};
  let keepAlive = null;
  let isClosed = false;
  let cleanupConnection = () => {};

  const stream = new ReadableStream({
    start(controller) {
      function enqueue(type, data) {
        if (isClosed) {
          return;
        }

        controller.enqueue(encodeSseEvent(type, data));
      }

      cleanupConnection = (reason = "客户端断开") => {
        if (isClosed) {
          return;
        }

        isClosed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
        }
        unsubscribe();
        closeController(controller);
        logInfo("robotEvents", "subscriber_disconnected", {
          direction: "页面→中转服务",
          route: "GET /robot/events",
          connectionId,
          connectionDurationMs: Date.now() - connectedAt,
          listenerCount: readRobotEventStatus().listenerCount,
          reason,
        });
      };

      logInfo("robotEvents", "subscriber_connected", {
        direction: "页面→中转服务",
        route: "GET /robot/events",
        connectionId,
        listenerCount: readRobotEventStatus().listenerCount + 1,
      });

      enqueue("ready", {
        ok: true,
        at: new Date().toISOString(),
      });

      let replayCount = 0;
      unsubscribe = subscribeRobotEvents((event) => {
        if (event.replayed) {
          replayCount += 1;
        }
        enqueue(event.type, event);
      }, { replayRecent: true });

      logInfo("robotEvents", "replay_completed", {
        direction: "中转服务→页面",
        route: "GET /robot/events",
        connectionId,
        replayCount,
      });

      const snapshots = readActiveModelResponseSnapshots();
      for (const snapshot of snapshots) {
        enqueue("model_response_snapshot", {
          id: `model-response-snapshot-${snapshot.responseId}-${snapshot.chunkCount}`,
          type: "model_response_snapshot",
          at: new Date().toISOString(),
          replayed: true,
          data: snapshot,
        });
      }

      if (snapshots.length > 0) {
        logInfo("robotEvents", "snapshot_sent", {
          direction: "中转服务→页面",
          route: "GET /robot/events",
          connectionId,
          snapshotCount: snapshots.length,
        });
      }

      keepAlive = setInterval(() => {
        enqueue("ping", {
          at: new Date().toISOString(),
        });
      }, 15000);

      request.signal.addEventListener("abort", () => cleanupConnection("客户端断开"), { once: true });
    },
    cancel() {
      cleanupConnection("SSE 流被取消");
    },
  });

  return new Response(stream, {
    headers: createSseHeaders({
      "X-Accel-Buffering": "no",
    }),
  });
}
