import { logInfo, makeTraceId, previewText } from "@/shared/logging/logger.js";
import { readString } from "@/shared/strings.js";
import { publishRobotEvent } from "./robot-events.js";
import { isCurrentVoiceSession } from "./voice-session-state.js";

const MODEL_RESPONSE_STARTED = "1";
const MODEL_RESPONSE_ENDED = "0";
const RESPONSE_PARTIAL_EVENT = "RESPONSE_PARTIAL";
const MAX_ROBOT_ID_CHARS = 100;
const MAX_SESSION_ID_CHARS = 200;
const MAX_MODEL_RESPONSE_CONTENT_CHARS = 4096;
const MAX_MODEL_RESPONSE_TOTAL_CHARS = 64 * 1024;
const DUPLICATE_RESPONSE_START_WINDOW_MS = 1000;
const MODEL_RESPONSE_IDLE_TTL_MS = 2 * 60 * 1000;

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

function validateSessionFields(payload, traceId) {
  const robotId = readString(payload?.robotId);
  const sessionId = readString(payload?.sessionId);

  if (!robotId || robotId.length > MAX_ROBOT_ID_CHARS) {
    return {
      result: createValidationError(traceId, "valid robotId is required"),
    };
  }

  if (!sessionId || sessionId.length > MAX_SESSION_ID_CHARS) {
    return {
      result: createValidationError(traceId, "valid sessionId is required"),
    };
  }

  return { robotId, sessionId };
}

function createResponseId(sessionId, state) {
  state.sequence += 1;
  return `${sessionId}-response-${state.sequence}`;
}

function pruneStaleModelResponses(state, now = Date.now()) {
  for (const [sessionId, response] of state.responsesBySessionId) {
    if (now - response.lastActivityAt > MODEL_RESPONSE_IDLE_TTL_MS) {
      state.responsesBySessionId.delete(sessionId);
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

  getModelResponseState().responsesBySessionId.delete(sessionId);
}

export function readActiveModelResponseSnapshots() {
  const state = getModelResponseState();
  pruneStaleModelResponses(state);

  return Array.from(state.responsesBySessionId.values(), (response) => ({
    robotId: response.robotId,
    sessionId: response.sessionId,
    responseId: response.responseId,
    content: response.content,
    chunkCount: response.chunkCount,
    active: true,
  }));
}

export function handleModelResponseMonitor(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("model-response");
  const fields = validateSessionFields(payload, traceId);

  if (fields.result) {
    return fields.result;
  }

  const { robotId, sessionId } = fields;
  const status = readString(payload?.status);

  if (status !== MODEL_RESPONSE_STARTED && status !== MODEL_RESPONSE_ENDED) {
    return createValidationError(traceId, 'status must be "0" or "1"');
  }

  if (!isCurrentVoiceSession(robotId, sessionId)) {
    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId,
      status,
    });
  }

  const state = getModelResponseState();
  pruneStaleModelResponses(state);

  if (status === MODEL_RESPONSE_STARTED) {
    const existingResponse = state.responsesBySessionId.get(sessionId);

    if (existingResponse) {
      const isImmediateDuplicate = (
        existingResponse.chunkCount === 0 &&
        Date.now() - existingResponse.startedAt <= DUPLICATE_RESPONSE_START_WINDOW_MS
      );

      if (isImmediateDuplicate) {
        return createResult(200, traceId, {
          ok: true,
          ignored: true,
          robotId,
          sessionId,
          responseId: existingResponse.responseId,
          status,
        });
      }

      state.responsesBySessionId.delete(sessionId);
      publishModelResponseEvent("model_response_done", {
        traceId,
        robotId,
        sessionId,
        responseId: existingResponse.responseId,
        content: existingResponse.content,
        chunkCount: existingResponse.chunkCount,
        status: MODEL_RESPONSE_ENDED,
        interrupted: true,
      });
    }

    const startedAt = Date.now();
    const responseId = createResponseId(sessionId, state);
    state.responsesBySessionId.set(sessionId, {
      robotId,
      sessionId,
      responseId,
      content: "",
      chunkCount: 0,
      startedAt,
      lastActivityAt: startedAt,
    });

    publishModelResponseEvent("model_response_start", {
      traceId,
      robotId,
      sessionId,
      responseId,
      status,
    });

    logInfo("modelResponse", "started", {
      traceId,
      robotId,
      sessionId,
      responseId,
      status,
    });

    return createResult(200, traceId, {
      ok: true,
      robotId,
      sessionId,
      responseId,
      status,
    });
  }

  const activeResponse = state.responsesBySessionId.get(sessionId);

  if (!activeResponse) {
    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId,
      status,
    });
  }

  state.responsesBySessionId.delete(sessionId);
  publishModelResponseEvent("model_response_done", {
    traceId,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
    content: activeResponse.content,
    chunkCount: activeResponse.chunkCount,
    status,
  });

  logInfo("modelResponse", "completed", {
    traceId,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
    status,
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
    status,
  });
}

export function handleModelResponseStream(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("model-response");
  const fields = validateSessionFields(payload, traceId);

  if (fields.result) {
    return fields.result;
  }

  const { robotId, sessionId } = fields;
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

  if (!isCurrentVoiceSession(robotId, sessionId) || !content) {
    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId,
    });
  }

  const state = getModelResponseState();
  pruneStaleModelResponses(state);
  const activeResponse = state.responsesBySessionId.get(sessionId);

  if (!activeResponse) {
    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId,
    });
  }

  if (activeResponse.content.length + content.length > MAX_MODEL_RESPONSE_TOTAL_CHARS) {
    return createValidationError(
      traceId,
      `model response must not exceed ${MAX_MODEL_RESPONSE_TOTAL_CHARS} characters`,
    );
  }

  activeResponse.content += content;
  activeResponse.chunkCount += 1;
  activeResponse.lastActivityAt = Date.now();

  publishModelResponseEvent("model_response_delta", {
    traceId,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
    event: RESPONSE_PARTIAL_EVENT,
    content,
  });

  logInfo("modelResponse", "delta_received", {
    traceId,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
    contentPreview: previewText(content),
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId,
    responseId: activeResponse.responseId,
  });
}
