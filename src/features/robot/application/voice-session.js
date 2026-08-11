import { randomUUID } from "crypto";
import {
  getControlServiceVoiceSessionControlTarget,
  sendControlServiceVoiceSessionControl,
} from "@/integrations/control-service/client.js";
import { controlServiceConfig } from "@/integrations/control-service/config.js";
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
const VOICE_SESSION_CONTROL_ROUTE = "POST /robot/voiceSession/control";
const VOICE_SERVICE_NAME = "语音服务";
const CONTROL_SERVICE_NAME = "控制服务";

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

function createControlFailureMessage({ voiceServiceFailed, controlServiceFailed }) {
  if (voiceServiceFailed && controlServiceFailed) {
    return "语音服务和控制服务暂时不可用";
  }

  return voiceServiceFailed ? "语音服务暂时不可用" : "控制服务暂时不可用";
}

async function forwardVoiceSessionControl({ robotId, sessionId, status, traceId }) {
  const dependencies = [
    {
      service: VOICE_SERVICE_NAME,
      requestDirection: "中转服务→语音服务",
      responseDirection: "语音服务→中转服务",
      target: getRobotVoiceSessionControlTarget(),
      timeoutMs: robotClientConfig.timeoutMs,
      send: () => sendVoiceSessionControl({ robotId, sessionId, status }),
    },
    {
      service: CONTROL_SERVICE_NAME,
      requestDirection: "中转服务→控制服务",
      responseDirection: "控制服务→中转服务",
      target: getControlServiceVoiceSessionControlTarget(),
      timeoutMs: controlServiceConfig.timeoutMs,
      send: () => sendControlServiceVoiceSessionControl({ status }),
    },
  ];

  for (const dependency of dependencies) {
    logInfo("voiceSession", "control_sending", {
      direction: dependency.requestDirection,
      traceId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      service: dependency.service,
      robotId,
      wholeSessionId: sessionId,
      status,
      target: dependency.target,
      timeoutMs: dependency.timeoutMs,
    });
  }

  const dependencyResults = await Promise.allSettled(
    dependencies.map((dependency) => dependency.send()),
  );

  dependencyResults.forEach((dependencyResult, index) => {
    const dependency = dependencies[index];

    if (dependencyResult.status === "fulfilled") {
      logInfo("voiceSession", "forward_succeeded", {
        direction: dependency.responseDirection,
        traceId,
        route: VOICE_SESSION_CONTROL_ROUTE,
        service: dependency.service,
        robotId,
        wholeSessionId: sessionId,
        status,
        statusCode: dependencyResult.value.status,
        target: dependencyResult.value.targetUrl,
        durationMs: dependencyResult.value.durationMs,
        outcome: "已接收",
      });
      return;
    }

    const error = dependencyResult.reason;
    logError("voiceSession", "control_failed", {
      direction: dependency.responseDirection,
      traceId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      service: dependency.service,
      robotId,
      wholeSessionId: sessionId,
      status,
      target: error?.targetUrl ?? dependency.target,
      durationMs: error?.durationMs,
      timeoutMs: error?.timeoutMs ?? dependency.timeoutMs,
      statusCode: error?.statusCode,
      error,
    });
  });

  const voiceServiceFailed = dependencyResults[0].status === "rejected";
  const controlServiceFailed = dependencyResults[1].status === "rejected";

  if (voiceServiceFailed || controlServiceFailed) {
    return {
      ok: false,
      error: createControlFailureMessage({ voiceServiceFailed, controlServiceFailed }),
    };
  }

  return { ok: true };
}

async function startVoiceSession({ robotId, traceId }) {
  const currentSession = readVoiceSession(robotId);
  const sessionId = currentSession?.sessionId ?? createVoiceSessionId();
  const isAlreadyActive = currentSession?.phase === "active";

  logInfo("voiceSession", currentSession ? "session_reused" : "session_created", {
    direction: "中转内部",
    traceId,
    robotId,
    wholeSessionId: sessionId,
    status: VOICE_SESSION_STARTED,
    association: isAlreadyActive
      ? "活动会话重复开始"
      : currentSession
        ? "上次启动失败后的重试"
        : "首次点击开始",
  });

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: isAlreadyActive ? "active" : "starting",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  const forwardResult = await forwardVoiceSessionControl({
    robotId,
    sessionId,
    status: VOICE_SESSION_STARTED,
    traceId,
  });

  if (!forwardResult.ok) {
    return createResult(502, traceId, {
      ok: false,
      error: forwardResult.error,
    });
  }

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

  const forwardResult = await forwardVoiceSessionControl({
    robotId,
    sessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
    traceId,
  });

  if (!forwardResult.ok) {
    return createResult(502, traceId, {
      ok: false,
      error: forwardResult.error,
    });
  }

  const endedAt = Date.now();
  markVoiceSessionEnded({ robotId, sessionId: requestedSessionId });
  forgetModelResponseSession(requestedSessionId);

  logInfo("voiceSession", "ended", {
    direction: "中转内部",
    traceId,
    robotId,
    wholeSessionId: requestedSessionId,
    status: VOICE_SESSION_ENDED,
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
