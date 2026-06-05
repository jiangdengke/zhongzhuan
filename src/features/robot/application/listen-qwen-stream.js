import { getDeepSeekReplyStream } from "@/integrations/deepseek/client.js";
import { logError, logInfo, makeTraceId, previewText } from "@/shared/logging/logger.js";
import { DEFAULT_ROBOT_ID, ROBOT_EVENTS, ROBOT_REPLIES } from "../domain/constants.js";
import { createResponsePayload, normalizeListenPayload } from "./listen-request.js";

export function createInvalidListenStreamResult({ requestId = makeTraceId("listen_stream"), startedAt = Date.now() } = {}) {
  logError("listenQwen", "invalid_json", {
    traceId: requestId,
    durationMs: Date.now() - startedAt,
    stream: true,
  });

  return {
    traceId: requestId,
    events: [
      {
        type: "error",
        data: createResponsePayload(DEFAULT_ROBOT_ID, ROBOT_REPLIES.invalidJson),
      },
      {
        type: "done",
        data: createResponsePayload(DEFAULT_ROBOT_ID, ROBOT_REPLIES.invalidJson),
      },
    ],
  };
}

export async function* streamListenQwen(payload, options = {}, dependencies = {}) {
  const requestId = options.requestId ?? makeTraceId("listen_stream");
  const startedAt = options.startedAt ?? Date.now();
  const getConversationReplyStream = dependencies.getConversationReplyStream ?? getDeepSeekReplyStream;
  const request = normalizeListenPayload(payload, requestId);

  logInfo("listenQwen", "request_received", {
    traceId: request.traceId,
    requestId,
    robotId: request.robotId,
    event: request.event,
    sessionId: request.sessionId,
    functionName: request.functionName,
    contentPreview: previewText(request.content, 120),
    functionParamPreview: previewText(typeof request.functionParam === "string" ? request.functionParam : "", 120),
    hasFunctionParam: request.functionParam !== undefined && request.functionParam !== null,
    stream: true,
  });

  yield {
    type: "meta",
    data: {
      traceId: request.traceId,
      robotId: request.robotId,
      event: ROBOT_EVENTS.responseContext,
    },
  };

  if (request.event === ROBOT_EVENTS.speechContext) {
    let reply = "";
    let chunkCount = 0;

    for await (const chunk of getConversationReplyStream(request.content, {
      traceId: request.traceId,
      sessionId: request.sessionId,
    })) {
      reply += chunk;
      chunkCount += 1;
      yield {
        type: "delta",
        data: {
          content: chunk,
        },
      };
    }

    logInfo("listenQwen", "response_ready", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      event: request.event,
      durationMs: Date.now() - startedAt,
      replyPreview: previewText(reply, 120),
      chunkCount,
      stream: true,
    });

    yield {
      type: "done",
      data: createResponsePayload(request.robotId, reply),
    };
    return;
  }

  if (request.event === ROBOT_EVENTS.command) {
    logInfo("listenQwen", "branch_cmd", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      functionName: request.functionName,
      durationMs: Date.now() - startedAt,
      replyPreview: previewText(ROBOT_REPLIES.commandAccepted, 120),
      stream: true,
    });

    yield {
      type: "delta",
      data: {
        content: ROBOT_REPLIES.commandAccepted,
      },
    };
    yield {
      type: "done",
      data: createResponsePayload(request.robotId, ROBOT_REPLIES.commandAccepted),
    };
    return;
  }

  logError("listenQwen", "unknown_event", {
    traceId: request.traceId,
    sessionId: request.sessionId,
    robotId: request.robotId,
    event: request.event,
    durationMs: Date.now() - startedAt,
    stream: true,
  });

  yield {
    type: "error",
    data: createResponsePayload(request.robotId, ROBOT_REPLIES.unknownEvent),
  };
  yield {
    type: "done",
    data: createResponsePayload(request.robotId, ROBOT_REPLIES.unknownEvent),
  };
}
