import { randomUUID } from "crypto";
import {
  getRobotVoiceSessionControlTarget,
  sendVoiceSessionControl,
} from "@/integrations/robot-client/client.js";
import { robotClientConfig } from "@/integrations/robot-client/config.js";
import { logError, logInfo, makeTraceId } from "@/shared/logging/logger.js";
import { readString } from "@/shared/strings.js";
import { forgetModelResponseSession } from "./model-response.js";
import {
  isEndedVoiceSession,
  markVoiceSessionEnded,
  readVoiceSession,
  rememberVoiceSession,
  runVoiceSessionControlSerially,
} from "./voice-session-state.js";

const VOICE_SESSION_STARTED = "1";
const VOICE_SESSION_ENDED = "0";

function createVoiceSessionId() {
  return `session-${randomUUID()}`;
}

function isValidVoiceSessionStatus(status) {
  return status === VOICE_SESSION_STARTED || status === VOICE_SESSION_ENDED;
}

function createResult(status, traceId, body) {
  return { status, traceId, body };
}

function createValidationError(traceId, error) {
  return createResult(400, traceId, { ok: false, error });
}

export function createInvalidVoiceSessionJsonResult({
  traceId = makeTraceId("voice-session"),
} = {}) {
  return createValidationError(traceId, "Invalid JSON");
}

async function startVoiceSession({ robotId, traceId }) {
  const currentSession = readVoiceSession(robotId);
  const sessionId = currentSession?.sessionId ?? createVoiceSessionId();

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: "starting",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  logInfo("voiceSession", "control_sending", {
    traceId,
    robotId,
    sessionId,
    status: VOICE_SESSION_STARTED,
    target: getRobotVoiceSessionControlTarget(),
    timeoutMs: robotClientConfig.timeoutMs,
  });

  let controlResult;

  try {
    controlResult = await sendVoiceSessionControl({
      robotId,
      sessionId,
      status: VOICE_SESSION_STARTED,
    });
  } catch (error) {
    logError("voiceSession", "control_failed", {
      traceId,
      robotId,
      sessionId,
      status: VOICE_SESSION_STARTED,
      target: error.targetUrl ?? getRobotVoiceSessionControlTarget(),
      durationMs: error.durationMs,
      timeoutMs: error.timeoutMs ?? robotClientConfig.timeoutMs,
      statusCode: error.statusCode,
      error,
    });

    return createResult(502, traceId, {
      ok: false,
      error: "机器人客户端暂时不可用",
    });
  }

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: "active",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  logInfo("voiceSession", "started", {
    traceId,
    robotId,
    sessionId,
    status: VOICE_SESSION_STARTED,
    target: controlResult.targetUrl,
    durationMs: controlResult.durationMs,
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId,
    status: VOICE_SESSION_STARTED,
  });
}

async function endVoiceSession({ robotId, requestedSessionId, traceId }) {
  const currentSession = readVoiceSession(robotId);

  if (isEndedVoiceSession(requestedSessionId)) {
    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
    });
  }

  if (currentSession && currentSession.sessionId !== requestedSessionId) {
    return createResult(409, traceId, {
      ok: false,
      error: "会话标识与当前语音会话不一致",
    });
  }

  if (!currentSession) {
    return createResult(409, traceId, {
      ok: false,
      error: "当前没有可结束的语音会话",
    });
  }

  logInfo("voiceSession", "control_sending", {
    traceId,
    robotId,
    sessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
    target: getRobotVoiceSessionControlTarget(),
    timeoutMs: robotClientConfig.timeoutMs,
  });

  let controlResult;

  try {
    controlResult = await sendVoiceSessionControl({
      robotId,
      sessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
    });
  } catch (error) {
    logError("voiceSession", "control_failed", {
      traceId,
      robotId,
      sessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
      target: error.targetUrl ?? getRobotVoiceSessionControlTarget(),
      durationMs: error.durationMs,
      timeoutMs: error.timeoutMs ?? robotClientConfig.timeoutMs,
      statusCode: error.statusCode,
      error,
    });

    return createResult(502, traceId, {
      ok: false,
      error: "机器人客户端暂时不可用",
    });
  }

  markVoiceSessionEnded({ robotId, sessionId: requestedSessionId });
  forgetModelResponseSession(requestedSessionId);

  logInfo("voiceSession", "ended", {
    traceId,
    robotId,
    sessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
    target: controlResult.targetUrl,
    durationMs: controlResult.durationMs,
  });

  return createResult(200, traceId, {
    ok: true,
    robotId,
    sessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
  });
}

export async function handleVoiceSessionControl(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("voice-session");
  const robotId = readString(payload?.robotId, robotClientConfig.robotId);
  const status = readString(payload?.status);
  const requestedSessionId = readString(payload?.sessionId);

  if (robotId !== robotClientConfig.robotId) {
    return createResult(403, traceId, {
      ok: false,
      error: "robotId 与当前机器人配置不一致",
    });
  }

  if (!isValidVoiceSessionStatus(status)) {
    return createValidationError(traceId, 'status must be "0" or "1"');
  }

  if (status === VOICE_SESSION_ENDED && !requestedSessionId) {
    return createValidationError(traceId, "sessionId is required when ending a session");
  }

  return runVoiceSessionControlSerially(robotId, () => {
    if (status === VOICE_SESSION_STARTED) {
      return startVoiceSession({ robotId, traceId });
    }

    return endVoiceSession({
      robotId,
      requestedSessionId,
      traceId,
    });
  });
}
