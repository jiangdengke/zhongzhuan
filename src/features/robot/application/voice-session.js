import { randomUUID } from "crypto";
import {
  getRobotVoiceSessionControlTarget,
  sendVoiceSessionControl,
} from "@/integrations/robot-client/client.js";
import { robotClientConfig } from "@/integrations/robot-client/config.js";
import { logError, logInfo, logWarn, makeTraceId } from "@/shared/logging/logger.js";
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

  logInfo("voiceSession", currentSession ? "session_reused" : "session_created", {
    direction: "中转内部",
    traceId,
    robotId,
    wholeSessionId: sessionId,
    status: VOICE_SESSION_STARTED,
    association: currentSession ? "上次启动失败后的重试" : "首次点击开始",
  });

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: "starting",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  logInfo("voiceSession", "control_sending", {
    direction: "中转服务→语音服务",
    traceId,
    route: "POST /robot/voiceSession/control",
    service: "语音服务",
    robotId,
    wholeSessionId: sessionId,
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
      direction: "语音服务→中转服务",
      traceId,
      route: "POST /robot/voiceSession/control",
      service: "语音服务",
      robotId,
      wholeSessionId: sessionId,
      status: VOICE_SESSION_STARTED,
      target: error.targetUrl ?? getRobotVoiceSessionControlTarget(),
      durationMs: error.durationMs,
      timeoutMs: error.timeoutMs ?? robotClientConfig.timeoutMs,
      statusCode: error.statusCode,
      error,
    });

    return createResult(502, traceId, {
      ok: false,
      error: "语音服务暂时不可用",
    });
  }

  logInfo("voiceSession", "forward_succeeded", {
    direction: "语音服务→中转服务",
    traceId,
    route: "POST /robot/voiceSession/control",
    service: "语音服务",
    robotId,
    wholeSessionId: sessionId,
    status: VOICE_SESSION_STARTED,
    statusCode: controlResult.status,
    target: controlResult.targetUrl,
    durationMs: controlResult.durationMs,
    outcome: "已接收",
  });

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: "active",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  logInfo("voiceSession", "started", {
    direction: "中转内部",
    traceId,
    robotId,
    wholeSessionId: sessionId,
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
    logWarn("voiceSession", "ignored", {
      direction: "页面→中转服务",
      traceId,
      robotId,
      wholeSessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
      outcome: "忽略",
      ignoreReason: "重复结束请求已处理",
    });

    return createResult(200, traceId, {
      ok: true,
      ignored: true,
      robotId,
      sessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
    });
  }

  if (currentSession && currentSession.sessionId !== requestedSessionId) {
    logWarn("voiceSession", "conflict", {
      direction: "页面→中转服务",
      traceId,
      robotId,
      wholeSessionId: requestedSessionId,
      association: `当前活动会话=${currentSession.sessionId}`,
      outcome: "冲突",
      reason: "结束会话标识不一致",
    });

    return createResult(409, traceId, {
      ok: false,
      error: "会话标识与当前语音会话不一致",
    });
  }

  if (!currentSession) {
    logWarn("voiceSession", "conflict", {
      direction: "页面→中转服务",
      traceId,
      robotId,
      wholeSessionId: requestedSessionId,
      outcome: "冲突",
      reason: "当前没有活动会话",
    });

    return createResult(409, traceId, {
      ok: false,
      error: "当前没有可结束的语音会话",
    });
  }

  logInfo("voiceSession", "control_sending", {
    direction: "中转服务→语音服务",
    traceId,
    route: "POST /robot/voiceSession/control",
    service: "语音服务",
    robotId,
    wholeSessionId: requestedSessionId,
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
      direction: "语音服务→中转服务",
      traceId,
      route: "POST /robot/voiceSession/control",
      service: "语音服务",
      robotId,
      wholeSessionId: requestedSessionId,
      status: VOICE_SESSION_ENDED,
      target: error.targetUrl ?? getRobotVoiceSessionControlTarget(),
      durationMs: error.durationMs,
      timeoutMs: error.timeoutMs ?? robotClientConfig.timeoutMs,
      statusCode: error.statusCode,
      error,
    });

    return createResult(502, traceId, {
      ok: false,
      error: "语音服务暂时不可用",
    });
  }

  logInfo("voiceSession", "forward_succeeded", {
    direction: "语音服务→中转服务",
    traceId,
    route: "POST /robot/voiceSession/control",
    service: "语音服务",
    robotId,
    wholeSessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
    statusCode: controlResult.status,
    target: controlResult.targetUrl,
    durationMs: controlResult.durationMs,
    outcome: "已接收",
  });

  const endedAt = Date.now();
  markVoiceSessionEnded({ robotId, sessionId: requestedSessionId });
  forgetModelResponseSession(requestedSessionId);

  logInfo("voiceSession", "ended", {
    direction: "中转内部",
    traceId,
    robotId,
    wholeSessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
    target: controlResult.targetUrl,
    durationMs: controlResult.durationMs,
    sessionDurationMs: endedAt - currentSession.startedAt,
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
      error: "robotId 与当前终端配置不一致",
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
