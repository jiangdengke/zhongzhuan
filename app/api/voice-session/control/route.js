import { NextResponse } from "next/server";
import {
  createInvalidVoiceSessionJsonResult,
  handleVoiceSessionControl,
} from "@/features/robot/application/voice-session.js";
import { readJsonBody } from "@/shared/http/json.js";
import { logError, logInfo, logWarn, makeTraceId } from "@/shared/logging/logger.js";

const MAX_CONTROL_BODY_BYTES = 4096;

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("voice-session");
  const startedAt = Date.now();
  const route = "POST /api/voice-session/control";

  const payload = await readJsonBody(request, {
    maxBytes: MAX_CONTROL_BODY_BYTES,
    requireJson: true,
  });

  if (!payload.ok) {
    logWarn("voiceSession", "request_rejected", {
      direction: "页面→中转服务",
      traceId,
      route,
      method: "POST",
      statusCode: payload.status,
      outcome: "拒绝",
      reason: payload.error,
      durationMs: Date.now() - startedAt,
    });

    if (payload.status !== 400) {
      return NextResponse.json(
        { ok: false, error: payload.error },
        { status: payload.status, headers: { "x-trace-id": traceId } },
      );
    }

    return toJsonResponse(createInvalidVoiceSessionJsonResult({ traceId }));
  }

  const requestedStatus = payload.data?.status;
  const requestedSessionId = payload.data?.sessionId;

  logInfo("voiceSession", "request_received", {
    direction: "页面→中转服务",
    traceId,
    route,
    method: "POST",
    status: requestedStatus,
    action: requestedStatus === "1" ? "开始" : requestedStatus === "0" ? "结束" : requestedStatus,
    wholeSessionId: requestedSessionId,
  });

  const result = await handleVoiceSessionControl(payload.data, { traceId });
  const responseBody = result.body ?? {};
  const isFailed = result.status >= 500 || responseBody.ok === false;
  const isIgnored = responseBody.ignored === true;
  const logDetails = {
    direction: "中转服务→页面",
    traceId,
    route,
    method: "POST",
    wholeSessionId: responseBody.sessionId ?? requestedSessionId,
    status: responseBody.status ?? requestedStatus,
    action: requestedStatus === "1" ? "开始" : requestedStatus === "0" ? "结束" : requestedStatus,
    statusCode: result.status,
    outcome: isFailed ? "失败" : isIgnored ? "忽略" : "成功",
    reason: responseBody.error,
    durationMs: Date.now() - startedAt,
  };

  if (isFailed) {
    logError("voiceSession", "response_sent", logDetails);
  } else if (isIgnored) {
    logWarn("voiceSession", "response_sent", logDetails);
  } else {
    logInfo("voiceSession", "response_sent", logDetails);
  }

  return toJsonResponse(result);
}
