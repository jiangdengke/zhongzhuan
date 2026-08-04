import { logError, logInfo, logWarn, makeTraceId } from "@/shared/logging/logger.js";
import { readString } from "@/shared/strings.js";
import { publishRobotEvent } from "./robot-events.js";
import { readVoiceSession } from "./voice-session-state.js";

const MODEL_RESPONSE_STARTED = "1";
const MODEL_RESPONSE_ENDED = "0";
const RESPONSE_PARTIAL_EVENT = "RESPONSE_PARTIAL";
const MAX_ROBOT_ID_CHARS = 100;
const MAX_SESSION_ID_CHARS = 200;
const MAX_MODEL_RESPONSE_CONTENT_CHARS = 4096;
const MAX_MODEL_RESPONSE_TOTAL_CHARS = 64 * 1024;
const DUPLICATE_RESPONSE_START_WINDOW_MS = 1000;
const MODEL_RESPONSE_IDLE_TTL_MS = 2 * 60 * 1000;
const MODEL_RESPONSE_MONITOR_ROUTE = "POST /robot/model/response_monitor";
const MODEL_RESPONSE_STREAM_ROUTE = "POST /robot/model/Response/stream";

function getModelResponseState() {
  if (!globalThis.__robotModelResponseState) {
    globalThis.__robotModelResponseState = {
      responsesBySessionId: new Map(),
      sequence: 0,
    };
  }

  return globalThis.__robotModelResponseState;
}

function createResult(status, traceId, body) {
  return { status, traceId, body };
}

function createValidationError(traceId, error) {
  return createResult(400, traceId, { ok: false, error });
}

function validateCallbackFields(payload, traceId) {
  const robotId = readString(payload?.robotId);
  const callbackSessionId = readString(payload?.sessionId);

  if (!robotId || robotId.length > MAX_ROBOT_ID_CHARS) {
    return {
      result: createValidationError(traceId, "valid robotId is required"),
    };
  }

  if (callbackSessionId.length > MAX_SESSION_ID_CHARS) {
    return {
      result: createValidationError(
        traceId,
        `sessionId must not exceed ${MAX_SESSION_ID_CHARS} characters`,
      ),
    };
  }

  return { robotId, callbackSessionId };
}

function createResponseId(sessionId, state) {
  state.sequence += 1;
  return `${sessionId}-response-${state.sequence}`;
}

function pruneStaleModelResponses(state, now = Date.now()) {
  for (const [sessionId, response] of state.responsesBySessionId) {
    if (now - response.lastActivityAt > MODEL_RESPONSE_IDLE_TTL_MS) {
      state.responsesBySessionId.delete(sessionId);
      logWarn("modelResponse", "expired", {
        direction: "中转内部",
        robotId: response.robotId,
        wholeSessionId: sessionId,
        responseId: response.responseId,
        chunkCount: response.chunkCount,
        totalChars: response.content.length,
        totalDurationMs: now - response.startedAt,
        outcome: "清理",
        reason: "模型回复超过两分钟没有新片段",
      });
    }
  }
}

function publishModelResponseEvent(type, data) {
  return publishRobotEvent(type, data);
}

export function createInvalidModelResponseJsonResult({
  traceId = makeTraceId("model-response"),
} = {}) {
  return createValidationError(traceId, "Invalid JSON");
}

export function forgetModelResponseSession(sessionId) {
  if (!sessionId) {
    return;
  }

  const state = getModelResponseState();
  const activeResponse = state.responsesBySessionId.get(sessionId);

  if (!activeResponse) {
    return;
  }

  state.responsesBySessionId.delete(sessionId);
  logWarn("modelResponse", "interrupted", {
    direction: "中转内部",
    robotId: activeResponse.robotId,
    wholeSessionId: sessionId,
    responseId: activeResponse.responseId,
    chunkCount: activeResponse.chunkCount,
    totalChars: activeResponse.content.length,
    totalDurationMs: Date.now() - activeResponse.startedAt,
    outcome: "清理",
    reason: "整段语音会话已结束",
  });
}

export function readActiveModelResponseSnapshots() {
  const state = getModelResponseState();
  pruneStaleModelResponses(state);

  return Array.from(state.responsesBySessionId.values(), (response) => ({
    robotId: response.robotId,
    sessionId: response.sessionId,
    turnId: response.turnId,
    responseId: response.responseId,
    content: response.content,
    chunkCount: response.chunkCount,
    active: true,
  }));
}

export function handleModelResponseMonitor(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("model-response");
  const fields = validateCallbackFields(payload, traceId);

  if (fields.result) {
    return fields.result;
  }

  const { robotId, callbackSessionId } = fields;
  const status = readString(payload?.status);

  if (status !== MODEL_RESPONSE_STARTED && status !== MODEL_RESPONSE_ENDED) {
    return createValidationError(traceId, 'status must be "0" or "1"');
  }

  const currentVoiceSession = readVoiceSession(robotId);
  const wholeSessionId = currentVoiceSession?.sessionId;

  if (!wholeSessionId) {
    logWarn("modelResponse", "ignored", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_MONITOR_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      turnId: callbackSessionId,
      status,
      statusCode: 200,
      outcome: "忽略",
      ignoreReason: "当前终端没有活动的整段会话",
    });

    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      turnId: callbackSessionId || undefined,
      status,
    });
  }

  const state = getModelResponseState();
  pruneStaleModelResponses(state);

  if (status === MODEL_RESPONSE_STARTED) {
    const existingResponse = state.responsesBySessionId.get(wholeSessionId);

    if (existingResponse) {
      const isImmediateDuplicate = (
        existingResponse.chunkCount === 0 &&
        Date.now() - existingResponse.startedAt <= DUPLICATE_RESPONSE_START_WINDOW_MS
      );

      if (isImmediateDuplicate) {
        logWarn("modelResponse", "ignored", {
          direction: "语音服务→中转服务",
          route: MODEL_RESPONSE_MONITOR_ROUTE,
          service: "语音服务",
          traceId,
          robotId,
          wholeSessionId,
          turnId: callbackSessionId,
          responseId: existingResponse.responseId,
          status,
          statusCode: 200,
          outcome: "忽略",
          ignoreReason: "重复的模型开始回调",
        });

        return createResult(200, traceId, {
          ok: true,
          ignored: true,
          robotId,
          sessionId: wholeSessionId,
          turnId: callbackSessionId || undefined,
          responseId: existingResponse.responseId,
          status,
        });
      }

      state.responsesBySessionId.delete(wholeSessionId);
      logWarn("modelResponse", "interrupted", {
        direction: "中转内部",
        traceId,
        robotId,
        wholeSessionId,
        turnId: existingResponse.turnId,
        responseId: existingResponse.responseId,
        chunkCount: existingResponse.chunkCount,
        totalChars: existingResponse.content.length,
        outcome: "中断",
        reason: "新的模型开始回调覆盖未结束回复",
      });
      publishModelResponseEvent("model_response_done", {
        traceId,
        robotId,
        sessionId: wholeSessionId,
        turnId: existingResponse.turnId,
        responseId: existingResponse.responseId,
        content: existingResponse.content,
        chunkCount: existingResponse.chunkCount,
        status: MODEL_RESPONSE_ENDED,
        interrupted: true,
      });
    }

    const startedAt = Date.now();
    const responseId = createResponseId(wholeSessionId, state);
    state.responsesBySessionId.set(wholeSessionId, {
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId,
      responseId,
      content: "",
      chunkCount: 0,
      startedAt,
      lastActivityAt: startedAt,
    });

    publishModelResponseEvent("model_response_start", {
      traceId,
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId,
      responseId,
      status,
    });

    logInfo("modelResponse", "started", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_MONITOR_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      wholeSessionId,
      turnId: callbackSessionId,
      responseId,
      status,
      responseSource: "语音服务侧模型",
      statusCode: 200,
      outcome: "已接收",
    });

    return createResult(200, traceId, {
      ok: true,
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId || undefined,
      responseId,
      status,
    });
  }

  const activeResponse = state.responsesBySessionId.get(wholeSessionId);

  if (!activeResponse) {
    logWarn("modelResponse", "ignored", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_MONITOR_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      wholeSessionId,
      turnId: callbackSessionId,
      status,
      statusCode: 200,
      outcome: "忽略",
      ignoreReason: "未收到模型开始回调",
    });

    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId || undefined,
      status,
    });
  }

  state.responsesBySessionId.delete(wholeSessionId);
  publishModelResponseEvent("model_response_done", {
    traceId,
    robotId,
    sessionId: wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId,
    responseId: activeResponse.responseId,
    content: activeResponse.content,
    chunkCount: activeResponse.chunkCount,
    status,
  });

  logInfo("modelResponse", "completed", {
    direction: "语音服务→中转服务",
    route: MODEL_RESPONSE_MONITOR_ROUTE,
    service: "语音服务",
    traceId,
    robotId,
    wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId,
    responseId: activeResponse.responseId,
    status,
    responseSource: "语音服务侧模型",
    statusCode: 200,
    chunkCount: activeResponse.chunkCount,
    totalChars: activeResponse.content.length,
    totalDurationMs: Date.now() - activeResponse.startedAt,
    outcome: "完成",
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId: wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId || undefined,
    responseId: activeResponse.responseId,
    status,
  });
}

export function handleModelResponseStream(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("model-response");
  const fields = validateCallbackFields(payload, traceId);

  if (fields.result) {
    return fields.result;
  }

  const { robotId, callbackSessionId } = fields;
  const event = readString(payload?.event);
  const language = readString(payload?.language);
  const content = payload?.content;

  if (event !== RESPONSE_PARTIAL_EVENT) {
    return createValidationError(traceId, `event must be "${RESPONSE_PARTIAL_EVENT}"`);
  }

  if (language !== "CN") {
    return createValidationError(traceId, 'language must be "CN"');
  }

  if (typeof content !== "string") {
    return createValidationError(traceId, "content must be a string");
  }

  if (content.length > MAX_MODEL_RESPONSE_CONTENT_CHARS) {
    return createValidationError(
      traceId,
      `content must not exceed ${MAX_MODEL_RESPONSE_CONTENT_CHARS} characters`,
    );
  }

  const currentVoiceSession = readVoiceSession(robotId);
  const wholeSessionId = currentVoiceSession?.sessionId;

  if (!wholeSessionId || !content) {
    logWarn("modelResponse", "ignored", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_STREAM_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      wholeSessionId,
      turnId: callbackSessionId,
      contentLength: typeof content === "string" ? content.length : 0,
      statusCode: 200,
      outcome: "忽略",
      ignoreReason: !wholeSessionId
        ? "当前终端没有活动的整段会话"
        : "增量内容为空",
    });

    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId || undefined,
    });
  }

  const state = getModelResponseState();
  pruneStaleModelResponses(state);
  const activeResponse = state.responsesBySessionId.get(wholeSessionId);

  if (!activeResponse) {
    logWarn("modelResponse", "ignored", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_STREAM_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      wholeSessionId,
      turnId: callbackSessionId,
      contentLength: content.length,
      statusCode: 200,
      outcome: "忽略",
      ignoreReason: "未收到模型开始回调",
    });

    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId: wholeSessionId,
      turnId: callbackSessionId || undefined,
    });
  }

  if (!activeResponse.turnId && callbackSessionId) {
    activeResponse.turnId = callbackSessionId;
  }

  if (activeResponse.content.length + content.length > MAX_MODEL_RESPONSE_TOTAL_CHARS) {
    logError("modelResponse", "ignored", {
      direction: "语音服务→中转服务",
      route: MODEL_RESPONSE_STREAM_ROUTE,
      service: "语音服务",
      traceId,
      robotId,
      wholeSessionId,
      turnId: callbackSessionId || activeResponse.turnId,
      responseId: activeResponse.responseId,
      contentLength: content.length,
      outcome: "拒绝",
      reason: `累计内容超过 ${MAX_MODEL_RESPONSE_TOTAL_CHARS} 字符上限`,
    });

    return createValidationError(
      traceId,
      `model response must not exceed ${MAX_MODEL_RESPONSE_TOTAL_CHARS} characters`,
    );
  }

  const chunkReceivedAt = Date.now();
  activeResponse.content += content;
  activeResponse.chunkCount += 1;
  activeResponse.lastActivityAt = chunkReceivedAt;

  if (activeResponse.chunkCount === 1) {
    activeResponse.firstChunkLatencyMs = chunkReceivedAt - activeResponse.startedAt;
  }

  publishModelResponseEvent("model_response_delta", {
    traceId,
    robotId,
    sessionId: wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId,
    responseId: activeResponse.responseId,
    event: RESPONSE_PARTIAL_EVENT,
    content,
  });

  logInfo("modelResponse", "delta_received", {
    direction: "语音服务→中转服务",
    route: MODEL_RESPONSE_STREAM_ROUTE,
    service: "语音服务",
    traceId,
    robotId,
    wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId,
    responseId: activeResponse.responseId,
    content,
    contentLength: content.length,
    receivedChunkCount: activeResponse.chunkCount,
    totalChars: activeResponse.content.length,
    firstChunkLatencyMs: activeResponse.firstChunkLatencyMs,
    statusCode: 200,
    outcome: "已接收",
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId: wholeSessionId,
    turnId: callbackSessionId || activeResponse.turnId || undefined,
    responseId: activeResponse.responseId,
  });
}
