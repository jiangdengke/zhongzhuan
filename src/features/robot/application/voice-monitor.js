import { logError, logInfo, makeTraceId } from "@/shared/logging/logger.js";
import { readString } from "@/shared/strings.js";
import { DEFAULT_ROBOT_ID, VOICE_PHASE, VOICE_STATUS } from "../domain/constants.js";
import { publishRobotEvent } from "./robot-events.js";

function isVoiceStatus(value) {
  return value === VOICE_STATUS.recordingStarted || value === VOICE_STATUS.recordingEnded;
}

export function createInvalidVoiceJsonResult({ traceId = makeTraceId("voice"), startedAt = Date.now() } = {}) {
  logError("voiceMonitor", "invalid_json", {
    traceId,
    durationMs: Date.now() - startedAt,
  });

  publishRobotEvent("robot_error", {
    traceId,
    scope: "voiceMonitor",
    reason: "invalid_json",
    message: "Invalid JSON",
  });

  return {
    status: 400,
    traceId,
    body: { error: "Invalid JSON" },
  };
}

export function handleVoiceMonitor(payload, options = {}) {
  const traceId = options.traceId ?? makeTraceId("voice");
  const startedAt = options.startedAt ?? Date.now();
  const robotId = readString(payload?.robotId, DEFAULT_ROBOT_ID);
  const status = readString(payload?.status);

  logInfo("voiceMonitor", "request_received", {
    direction: "语音服务→中转服务",
    route: "POST /robot/voiceMonitor",
    service: "语音服务",
    traceId,
    robotId,
    status,
  });

  if (!isVoiceStatus(status)) {
    logError("voiceMonitor", "invalid_status", {
      direction: "语音服务→中转服务",
      route: "POST /robot/voiceMonitor",
      service: "语音服务",
      traceId,
      robotId,
      status,
      durationMs: Date.now() - startedAt,
    });

    publishRobotEvent("robot_error", {
      traceId,
      robotId,
      scope: "voiceMonitor",
      reason: "invalid_status",
      status,
      message: 'status must be "0" or "1"',
    });

    return {
      status: 400,
      traceId,
      body: { error: 'status must be "0" or "1"' },
    };
  }

  logInfo("voiceMonitor", "request_completed", {
    direction: "语音服务→中转服务",
    route: "POST /robot/voiceMonitor",
    service: "语音服务",
    traceId,
    robotId,
    status,
    phase: VOICE_PHASE[status],
    durationMs: Date.now() - startedAt,
  });

  publishRobotEvent("voice", {
    traceId,
    robotId,
    status,
    phase: VOICE_PHASE[status],
    durationMs: Date.now() - startedAt,
  });

  return {
    status: 200,
    traceId,
    body: { ok: true },
  };
}
