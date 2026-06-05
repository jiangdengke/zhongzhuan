import { logError, logInfo, makeTraceId } from "@/shared/logging/logger.js";
import { readString } from "@/shared/strings.js";
import { DEFAULT_ROBOT_ID, VOICE_PHASE, VOICE_STATUS } from "../domain/constants.js";

function isVoiceStatus(value) {
  return value === VOICE_STATUS.recordingStarted || value === VOICE_STATUS.recordingEnded;
}

export function createInvalidVoiceJsonResult({ traceId = makeTraceId("voice"), startedAt = Date.now() } = {}) {
  logError("voiceMonitor", "invalid_json", {
    traceId,
    durationMs: Date.now() - startedAt,
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

  if (!isVoiceStatus(status)) {
    logError("voiceMonitor", "invalid_status", {
      traceId,
      robotId,
      status,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: 400,
      traceId,
      body: { error: 'status must be "0" or "1"' },
    };
  }

  logInfo("voiceMonitor", "request_completed", {
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
