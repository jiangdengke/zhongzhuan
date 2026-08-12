import { randomUUID } from "crypto";
import {
  getControlServiceVoiceSessionControlTarget,
  probeControlServiceVoiceSessionControl,
  sendControlServiceVoiceSessionControl,
} from "@/integrations/control-service/client.js";
import { controlServiceConfig } from "@/integrations/control-service/config.js";
import {
  getRobotVoiceSessionControlTarget,
  probeVoiceSessionControl,
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
const VOICE_SESSION_PROBE_ROUTE = "HEAD /robot/voiceSession/control";
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

function createVoiceServiceDependency({ robotId, sessionId, status }) {
  return {
    service: VOICE_SERVICE_NAME,
    requestDirection: "中转服务→语音服务",
    responseDirection: "语音服务→中转服务",
    target: getRobotVoiceSessionControlTarget(),
    timeoutMs: robotClientConfig.timeoutMs,
    probe: probeVoiceSessionControl,
    send: () => sendVoiceSessionControl({ robotId, sessionId, status }),
    compensate: () => sendVoiceSessionControl({
      robotId,
      sessionId,
      status: VOICE_SESSION_ENDED,
    }),
  };
}

function createControlServiceDependency({ status }) {
  return {
    service: CONTROL_SERVICE_NAME,
    requestDirection: "中转服务→控制服务",
    responseDirection: "控制服务→中转服务",
    target: getControlServiceVoiceSessionControlTarget(),
    timeoutMs: controlServiceConfig.timeoutMs,
    probe: probeControlServiceVoiceSessionControl,
    send: () => sendControlServiceVoiceSessionControl({ status }),
    compensate: () => sendControlServiceVoiceSessionControl({
      status: VOICE_SESSION_ENDED,
    }),
  };
}

function logDependencySending(message, {
  dependency,
  method,
  route,
  robotId,
  sessionId,
  stage,
  status,
  traceId,
}) {
  logInfo("voiceSession", message, {
    direction: dependency.requestDirection,
    traceId,
    route,
    method,
    stage,
    service: dependency.service,
    robotId,
    wholeSessionId: sessionId,
    status,
    target: dependency.target,
    timeoutMs: dependency.timeoutMs,
  });
}

function logDependencySucceeded(message, {
  dependency,
  method,
  result,
  robotId,
  route,
  sessionId,
  stage,
  status,
  traceId,
}) {
  logInfo("voiceSession", message, {
    direction: dependency.responseDirection,
    traceId,
    route,
    method,
    stage,
    service: dependency.service,
    robotId,
    wholeSessionId: sessionId,
    status,
    statusCode: result.status,
    target: result.targetUrl,
    durationMs: result.durationMs,
    outcome: "已接收",
  });
}

function logDependencyFailed(message, {
  dependency,
  error,
  method,
  robotId,
  route,
  sessionId,
  stage,
  status,
  traceId,
}) {
  logError("voiceSession", message, {
    direction: dependency.responseDirection,
    traceId,
    route,
    method,
    stage,
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
}

async function probeStartDependencies({ dependencies, robotId, sessionId, traceId }) {
  for (const dependency of dependencies) {
    logDependencySending("probe_sending", {
      dependency,
      method: "HEAD",
      route: VOICE_SESSION_PROBE_ROUTE,
      robotId,
      sessionId,
      stage: "probe",
      status: VOICE_SESSION_STARTED,
      traceId,
    });
  }

  const probeResults = await Promise.allSettled(
    dependencies.map((dependency) => dependency.probe()),
  );

  probeResults.forEach((probeResult, index) => {
    const dependency = dependencies[index];

    if (probeResult.status === "fulfilled") {
      logDependencySucceeded("probe_succeeded", {
        dependency,
        method: "HEAD",
        result: probeResult.value,
        robotId,
        route: VOICE_SESSION_PROBE_ROUTE,
        sessionId,
        stage: "probe",
        status: VOICE_SESSION_STARTED,
        traceId,
      });
      return;
    }

    logDependencyFailed("probe_failed", {
      dependency,
      error: probeResult.reason,
      method: "HEAD",
      robotId,
      route: VOICE_SESSION_PROBE_ROUTE,
      sessionId,
      stage: "probe",
      status: VOICE_SESSION_STARTED,
      traceId,
    });
  });

  return probeResults;
}

async function startDependency({ dependency, robotId, sessionId, traceId }) {
  logDependencySending("startup_sending", {
    dependency,
    method: "POST",
    route: VOICE_SESSION_CONTROL_ROUTE,
    robotId,
    sessionId,
    stage: "startup",
    status: VOICE_SESSION_STARTED,
    traceId,
  });

  try {
    const result = await dependency.send();
    logDependencySucceeded("startup_succeeded", {
      dependency,
      method: "POST",
      result,
      robotId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      sessionId,
      stage: "startup",
      status: VOICE_SESSION_STARTED,
      traceId,
    });
    return { ok: true };
  } catch (error) {
    logDependencyFailed("startup_failed", {
      dependency,
      error,
      method: "POST",
      robotId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      sessionId,
      stage: "startup",
      status: VOICE_SESSION_STARTED,
      traceId,
    });
    return { ok: false };
  }
}

async function compensateStartDependencies({ dependencies, robotId, sessionId, traceId }) {
  for (const dependency of dependencies) {
    logDependencySending("compensation_sending", {
      dependency,
      method: "POST",
      route: VOICE_SESSION_CONTROL_ROUTE,
      robotId,
      sessionId,
      stage: "compensation",
      status: VOICE_SESSION_ENDED,
      traceId,
    });
  }

  const compensationResults = await Promise.allSettled(
    dependencies.map((dependency) => dependency.compensate()),
  );

  compensationResults.forEach((compensationResult, index) => {
    const dependency = dependencies[index];

    if (compensationResult.status === "fulfilled") {
      logDependencySucceeded("compensation_succeeded", {
        dependency,
        method: "POST",
        result: compensationResult.value,
        robotId,
        route: VOICE_SESSION_CONTROL_ROUTE,
        sessionId,
        stage: "compensation",
        status: VOICE_SESSION_ENDED,
        traceId,
      });
      return;
    }

    logDependencyFailed("compensation_failed", {
      dependency,
      error: compensationResult.reason,
      method: "POST",
      robotId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      sessionId,
      stage: "compensation",
      status: VOICE_SESSION_ENDED,
      traceId,
    });
  });
}

async function forwardVoiceSessionControl({ robotId, sessionId, status, traceId }) {
  const dependencies = [
    createVoiceServiceDependency({ robotId, sessionId, status }),
    createControlServiceDependency({ status }),
  ];

  for (const dependency of dependencies) {
    logDependencySending("control_sending", {
      dependency,
      method: "POST",
      route: VOICE_SESSION_CONTROL_ROUTE,
      robotId,
      sessionId,
      stage: "stop",
      status,
      traceId,
    });
  }

  const dependencyResults = await Promise.allSettled(
    dependencies.map((dependency) => dependency.send()),
  );

  dependencyResults.forEach((dependencyResult, index) => {
    const dependency = dependencies[index];

    if (dependencyResult.status === "fulfilled") {
      logDependencySucceeded("forward_succeeded", {
        dependency,
        method: "POST",
        result: dependencyResult.value,
        robotId,
        route: VOICE_SESSION_CONTROL_ROUTE,
        sessionId,
        stage: "stop",
        status,
        traceId,
      });
      return;
    }

    logDependencyFailed("control_failed", {
      dependency,
      error: dependencyResult.reason,
      method: "POST",
      robotId,
      route: VOICE_SESSION_CONTROL_ROUTE,
      sessionId,
      stage: "stop",
      status,
      traceId,
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

  if (isAlreadyActive) {
    return createResult(200, traceId, {
      ok: true,
      robotId,
      sessionId,
      status: VOICE_SESSION_STARTED,
    });
  }

  rememberVoiceSession({
    robotId,
    sessionId,
    phase: "starting",
    startedAt: currentSession?.startedAt ?? Date.now(),
  });

  const voiceServiceDependency = createVoiceServiceDependency({
    robotId,
    sessionId,
    status: VOICE_SESSION_STARTED,
  });
  const controlServiceDependency = createControlServiceDependency({
    status: VOICE_SESSION_STARTED,
  });
  const dependencies = [voiceServiceDependency, controlServiceDependency];
  const probeResults = await probeStartDependencies({
    dependencies,
    robotId,
    sessionId,
    traceId,
  });
  const voiceServiceProbeFailed = probeResults[0].status === "rejected";
  const controlServiceProbeFailed = probeResults[1].status === "rejected";

  if (voiceServiceProbeFailed || controlServiceProbeFailed) {
    return createResult(502, traceId, {
      ok: false,
      error: createControlFailureMessage({
        voiceServiceFailed: voiceServiceProbeFailed,
        controlServiceFailed: controlServiceProbeFailed,
      }),
    });
  }

  const controlStartResult = await startDependency({
    dependency: controlServiceDependency,
    robotId,
    sessionId,
    traceId,
  });

  if (!controlStartResult.ok) {
    await compensateStartDependencies({
      dependencies: [controlServiceDependency],
      robotId,
      sessionId,
      traceId,
    });
    return createResult(502, traceId, {
      ok: false,
      error: "控制服务暂时不可用",
    });
  }

  const voiceStartResult = await startDependency({
    dependency: voiceServiceDependency,
    robotId,
    sessionId,
    traceId,
  });

  if (!voiceStartResult.ok) {
    await compensateStartDependencies({
      dependencies: [voiceServiceDependency, controlServiceDependency],
      robotId,
      sessionId,
      traceId,
    });
    return createResult(502, traceId, {
      ok: false,
      error: "语音服务暂时不可用",
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
