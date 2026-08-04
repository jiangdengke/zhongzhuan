import { NextResponse } from "next/server";
import {
  createInvalidModelResponseJsonResult,
  handleModelResponseMonitor,
} from "@/features/robot/application/model-response.js";
import { readJsonBody } from "@/shared/http/json.js";
import { logError, logInfo, logWarn, makeTraceId } from "@/shared/logging/logger.js";

const MAX_MONITOR_BODY_BYTES = 4096;

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("model-response");
  const startedAt = Date.now();
  const route = "POST /robot/model/response_monitor";
  const payload = await readJsonBody(request, {
    maxBytes: MAX_MONITOR_BODY_BYTES,
    requireJson: true,
  });

  if (!payload.ok) {
    logWarn("modelResponse", "response_sent", {
      direction: "中转服务→语音服务",
      route,
      service: "语音服务",
      traceId,
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

    return toJsonResponse(createInvalidModelResponseJsonResult({ traceId }));
  }

  logInfo("modelResponse", "request_received", {
    direction: "语音服务→中转服务",
    route,
    service: "语音服务",
    traceId,
    robotId: payload.data?.robotId,
    turnId: payload.data?.sessionId,
    status: payload.data?.status,
  });

  const result = handleModelResponseMonitor(payload.data, { traceId });
  const responseBody = result.body ?? {};
  const logDetails = {
    direction: "中转服务→语音服务",
    route,
    service: "语音服务",
    traceId,
    robotId: responseBody.robotId ?? payload.data?.robotId,
    wholeSessionId: responseBody.sessionId,
    turnId: responseBody.turnId ?? payload.data?.sessionId,
    responseId: responseBody.responseId,
    status: responseBody.status ?? payload.data?.status,
    statusCode: result.status,
    outcome: responseBody.ignored ? "忽略" : responseBody.ok === false ? "失败" : "成功",
    ignored: responseBody.ignored,
    reason: responseBody.error,
    durationMs: Date.now() - startedAt,
  };

  if (result.status >= 400 || responseBody.ok === false) {
    logError("modelResponse", "response_sent", logDetails);
  } else if (responseBody.ignored) {
    logWarn("modelResponse", "response_sent", logDetails);
  } else {
    logInfo("modelResponse", "response_sent", logDetails);
  }

  return toJsonResponse(result);
}
