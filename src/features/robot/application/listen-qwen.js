import { getDeepSeekReplyStream } from "@/integrations/deepseek/client.js";
import { logError, logInfo, makeTraceId, previewText } from "@/shared/logging/logger.js";
import { DEFAULT_ROBOT_ID, ROBOT_EVENTS, ROBOT_REPLIES } from "../domain/constants.js";
import { detectFlightCommand, readCommandSession, rememberCommandSession } from "./command-session.js";
import { createCommandReply } from "./command-replies.js";
import { createAcceptedPayload, createResponsePayload, normalizeListenPayload } from "./listen-request.js";
import { publishRobotEvent } from "./robot-events.js";

export function createInvalidListenJsonResult({ requestId = makeTraceId("listen"), startedAt = Date.now() } = {}) {
  logError("listenQwen", "invalid_json", {
    traceId: requestId,
    durationMs: Date.now() - startedAt,
  });

  publishRobotEvent("robot_error", {
    traceId: requestId,
    scope: "listenQwen",
    reason: "invalid_json",
    message: ROBOT_REPLIES.invalidJson,
  });

  return {
    status: 200,
    traceId: requestId,
    body: createResponsePayload(DEFAULT_ROBOT_ID, ROBOT_REPLIES.invalidJson),
  };
}

export async function handleListenQwen(payload, options = {}, dependencies = {}) {
  const requestId = options.requestId ?? makeTraceId("listen");
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
    stream: false,
  });

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
        stream: false,
      });

      publishRobotEvent("tts_done", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        event: ROBOT_EVENTS.responseContext,
        sourceEvent: ROBOT_EVENTS.command,
        functionName: cachedCommand.functionName,
        content: cachedCommand.reply,
        skippedEvent: request.event,
        durationMs: Date.now() - startedAt,
      });

      return {
        status: 200,
        traceId: request.traceId,
        body: createResponsePayload(request.robotId, cachedCommand.reply),
      };
    }

    const detectedCommand = detectFlightCommand(request.content);

    if (detectedCommand) {
      const commandRequest = {
        ...request,
        event: ROBOT_EVENTS.command,
        functionName: detectedCommand.functionName,
        functionParam: detectedCommand.functionParam,
      };

      publishRobotEvent("final_input", {
        traceId: request.traceId,
        requestId,
        robotId: request.robotId,
        event: ROBOT_EVENTS.command,
        language: request.language,
        sessionId: request.sessionId,
        functionName: commandRequest.functionName,
        functionParam: commandRequest.functionParam,
        content: request.content,
      });

      const commandReply = createCommandReply(commandRequest);
      rememberCommandSession(commandRequest, commandReply);

      logInfo("listenQwen", "redirect_speech_to_cmd", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        functionName: commandRequest.functionName,
        durationMs: Date.now() - startedAt,
        replyPreview: previewText(commandReply.reply, 120),
        stream: false,
      });

      publishRobotEvent("tts_done", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        event: ROBOT_EVENTS.responseContext,
        sourceEvent: ROBOT_EVENTS.command,
        functionName: commandRequest.functionName,
        content: commandReply.reply,
        durationMs: Date.now() - startedAt,
      });

      return {
        status: 200,
        traceId: request.traceId,
        body: createResponsePayload(request.robotId, commandReply.reply),
      };
    }

    publishRobotEvent("final_input", {
      traceId: request.traceId,
      requestId,
      robotId: request.robotId,
      event: request.event,
      language: request.language,
      sessionId: request.sessionId,
      content: request.content,
    });

    let reply = "";
    let chunkCount = 0;

    for await (const chunk of getConversationReplyStream(request.content, {
      traceId: request.traceId,
      sessionId: request.sessionId,
    })) {
      reply += chunk;
      chunkCount += 1;
      publishRobotEvent("deepseek_delta", {
        traceId: request.traceId,
        sessionId: request.sessionId,
        robotId: request.robotId,
        sourceEvent: request.event,
        content: chunk,
        chunkIndex: chunkCount,
      });
    }

    logInfo("listenQwen", "response_ready", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      event: request.event,
      durationMs: Date.now() - startedAt,
      replyPreview: previewText(reply, 120),
      chunkCount,
      stream: false,
    });

    publishRobotEvent("tts_done", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      event: ROBOT_EVENTS.responseContext,
      sourceEvent: request.event,
      content: reply,
      chunkCount,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: 200,
      traceId: request.traceId,
      body: createResponsePayload(request.robotId, reply),
    };
  }

  if (request.event === ROBOT_EVENTS.asrPartial) {
    publishRobotEvent("asr_partial", {
      traceId: request.traceId,
      requestId,
      robotId: request.robotId,
      language: request.language,
      sessionId: request.sessionId,
      content: request.content,
    });

    logInfo("listenQwen", "asr_partial_received", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      language: request.language,
      contentPreview: previewText(request.content, 120),
      durationMs: Date.now() - startedAt,
      stream: false,
    });

    return {
      status: 200,
      traceId: request.traceId,
      body: createAcceptedPayload(),
    };
  }

  if (request.event === ROBOT_EVENTS.command) {
    publishRobotEvent("final_input", {
      traceId: request.traceId,
      requestId,
      robotId: request.robotId,
      event: request.event,
      language: request.language,
      sessionId: request.sessionId,
      functionName: request.functionName,
      functionParam: request.functionParam,
      content: request.content,
    });

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
      stream: false,
    });

    publishRobotEvent("tts_done", {
      traceId: request.traceId,
      sessionId: request.sessionId,
      robotId: request.robotId,
      event: ROBOT_EVENTS.responseContext,
      sourceEvent: request.event,
      functionName: request.functionName,
      content: commandReply.reply,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: 200,
      traceId: request.traceId,
      body: createResponsePayload(request.robotId, commandReply.reply),
    };
  }

  logError("listenQwen", "unknown_event", {
    traceId: request.traceId,
    sessionId: request.sessionId,
    robotId: request.robotId,
    event: request.event,
    durationMs: Date.now() - startedAt,
    stream: false,
  });

  publishRobotEvent("robot_error", {
    traceId: request.traceId,
    sessionId: request.sessionId,
    robotId: request.robotId,
    event: request.event,
    reason: "unknown_event",
    message: ROBOT_REPLIES.unknownEvent,
  });

  return {
    status: 200,
    traceId: request.traceId,
    body: createResponsePayload(request.robotId, ROBOT_REPLIES.unknownEvent),
  };
}
