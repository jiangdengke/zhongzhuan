import { createInvalidListenStreamResult, streamListenQwen } from "@/features/robot/application/listen-qwen-stream.js";
import { readJsonBody } from "@/shared/http/json.js";
import { createSseHeaders, encodeSseEvent } from "@/shared/http/sse.js";
import { makeTraceId } from "@/shared/logging/logger.js";

function createEventStream(events) {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encodeSseEvent(event.type, event.data));
        }
      } catch (error) {
        const message = "请求失败，请稍后再试。";

        controller.enqueue(encodeSseEvent("error", {
          content: "请求失败，请稍后再试。",
          message: error instanceof Error ? error.message : String(error),
        }));
        controller.enqueue(encodeSseEvent("done", {
          robotId: "4",
          event: "RESPONSE_CONTEXT",
          content: message,
        }));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request) {
  const requestId = makeTraceId("listen_stream");
  const startedAt = Date.now();
  const payload = await readJsonBody(request);

  if (!payload.ok) {
    const result = createInvalidListenStreamResult({ requestId, startedAt });

    return new Response(createEventStream(result.events), {
      status: 400,
      headers: createSseHeaders({ "x-trace-id": result.traceId }),
    });
  }

  return new Response(createEventStream(streamListenQwen(payload.data, { requestId, startedAt })), {
    headers: createSseHeaders({ "x-trace-id": requestId }),
  });
}
