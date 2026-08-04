import { NextResponse } from "next/server";
import { createInvalidVoiceJsonResult, handleVoiceMonitor } from "@/features/robot/application/voice-monitor.js";
import { readJsonBody } from "@/shared/http/json.js";
import { logError, logInfo, logWarn, makeTraceId } from "@/shared/logging/logger.js";

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("voice");
  const startedAt = Date.now();
  const route = "POST /robot/voiceMonitor";
  const payload = await readJsonBody(request);

  if (!payload.ok) {
    logWarn("voiceMonitor", "response_sent", {
      direction: "中转服务→语音服务",
      route,
      service: "语音服务",
      traceId,
      statusCode: payload.status,
      outcome: "拒绝",
      reason: payload.error,
      durationMs: Date.now() - startedAt,
    });
    return toJsonResponse(createInvalidVoiceJsonResult({ traceId, startedAt }));
  }

  const result = handleVoiceMonitor(payload.data, { traceId, startedAt });
  const responseBody = result.body ?? {};
  const logDetails = {
    direction: "中转服务→语音服务",
    route,
    service: "语音服务",
    traceId,
    robotId: payload.data?.robotId,
    status: payload.data?.status,
    statusCode: result.status,
    outcome: responseBody.ok === false ? "失败" : "成功",
    reason: responseBody.error,
    durationMs: Date.now() - startedAt,
  };

  if (result.status >= 400 || responseBody.ok === false) {
    logError("voiceMonitor", "response_sent", logDetails);
  } else {
    logInfo("voiceMonitor", "response_sent", logDetails);
  }

  return toJsonResponse(result);
}
