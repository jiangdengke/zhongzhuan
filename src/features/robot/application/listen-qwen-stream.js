import { getDeepSeekReplyStream } from "@/integrations/deepseek/client.js";
import { logError, logInfo, makeTraceId, previewText } from "@/shared/logging/logger.js";
import { DEFAULT_ROBOT_ID, ROBOT_EVENTS, ROBOT_REPLIES } from "../domain/constants.js";
import { detectFlightCommand, readCommandSession, rememberCommandSession } from "./command-session.js";
import { createCommandReply } from "./command-replies.js";
import { createAcceptedPayload, createResponsePayload, normalizeListenPayload } from "./listen-request.js";

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
        type: "start",
        data: {
          traceId: requestId,
          robotId: DEFAULT_ROBOT_ID,
          event: ROBOT_EVENTS.responseContext,
          sourceEvent: "INVALID_JSON",
        },
      },
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
    language: request.language,
    sessionId: request.sessionId,
    functionName: request.functionName,
    contentPreview: previewText(request.content, 120),
    functionParamPreview: previewText(typeof request.functionParam === "string" ? request.functionParam : "", 120),
    hasFunctionParam: request.functionParam !== undefined && request.functionParam !== null,
    stream: true,
  });

  yield {
    type: "start",
    data: {
      traceId: request.traceId,
      robotId: request.robotId,
      event: ROBOT_EVENTS.responseContext,
      sourceEvent: request.event,
      sessionId: request.sessionId,
    },
  };

  if (request.event === ROBOT_EVENTS.speechContext) {
    const cachedCommand = readCommandSession(request.sessionId);

    if (cachedCommand) {
      logInfo("listenQwen", "skip_speech_after_cmd", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        functionName: cachedCommand.functionName,
        durationMs: Date.now() - startedAt,
        replyPreview: previewText(cachedCommand.reply, 120),
        stream: true,
      });

      yield {
        type: "delta",
        data: {
          content: cachedCommand.reply,
          chunkIndex: 1,
          sourceEvent: ROBOT_EVENTS.command,
          functionName: cachedCommand.functionName,
        },
      };
      yield {
        type: "done",
        data: {
          ...createResponsePayload(request.robotId, cachedCommand.reply),
          traceId: request.traceId,
          sourceEvent: ROBOT_EVENTS.command,
          functionName: cachedCommand.functionName,
          skippedEvent: request.event,
          chunkCount: 1,
        },
      };
      return;
    }

    const detectedCommand = detectFlightCommand(request.content);

    if (detectedCommand) {
      const commandRequest = {
        ...request,
        event: ROBOT_EVENTS.command,
        functionName: detectedCommand.functionName,
        functionParam: detectedCommand.functionParam,
      };
      const commandReply = createCommandReply(commandRequest);
      rememberCommandSession(commandRequest, commandReply);

      logInfo("listenQwen", "redirect_speech_to_cmd", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        functionName: commandRequest.functionName,
        durationMs: Date.now() - startedAt,
        replyPreview: previewText(commandReply.reply, 120),
        stream: true,
      });

      yield {
        type: "delta",
        data: {
          content: commandReply.reply,
          chunkIndex: 1,
          sourceEvent: ROBOT_EVENTS.command,
          functionName: commandRequest.functionName,
        },
      };
      yield {
        type: "done",
        data: {
          ...createResponsePayload(request.robotId, commandReply.reply),
          traceId: request.traceId,
          sourceEvent: ROBOT_EVENTS.command,
          functionName: commandRequest.functionName,
          chunkCount: 1,
        },
      };
      return;
    }

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
          chunkIndex: chunkCount,
          sourceEvent: request.event,
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
      data: {
        ...createResponsePayload(request.robotId, reply),
        traceId: request.traceId,
        sourceEvent: request.event,
        chunkCount,
      },
    };
    return;
  }

  if (request.event === ROBOT_EVENTS.asrPartial) {
    logInfo("listenQwen", "asr_partial_received", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      language: request.language,
      contentPreview: previewText(request.content, 120),
      durationMs: Date.now() - startedAt,
      stream: true,
    });

    yield {
      type: "done",
      data: createAcceptedPayload(),
    };
    return;
  }

  if (request.event === ROBOT_EVENTS.command) {
    const commandReply = createCommandReply(request);
    rememberCommandSession(request, commandReply);

    logInfo("listenQwen", "branch_cmd", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      functionName: request.functionName,
      commandOk: commandReply.ok,
      durationMs: Date.now() - startedAt,
      replyPreview: previewText(commandReply.reply, 120),
      stream: true,
    });

    yield {
      type: "delta",
      data: {
        content: commandReply.reply,
        chunkIndex: 1,
        sourceEvent: request.event,
        functionName: request.functionName,
      },
    };
    yield {
      type: "done",
      data: {
        ...createResponsePayload(request.robotId, commandReply.reply),
        traceId: request.traceId,
        sourceEvent: request.event,
        functionName: request.functionName,
        chunkCount: 1,
      },
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
