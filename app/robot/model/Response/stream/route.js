import { NextResponse } from "next/server";
import {
  createInvalidModelResponseJsonResult,
  handleModelResponseStream,
} from "@/features/robot/application/model-response.js";
import { readJsonBody } from "@/shared/http/json.js";
import { logError, logWarn, makeTraceId } from "@/shared/logging/logger.js";

const MAX_STREAM_BODY_BYTES = 16 * 1024;

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("model-response");
  const startedAt = Date.now();
  const route = "POST /robot/model/Response/stream";
  const payload = await readJsonBody(request, {
    maxBytes: MAX_STREAM_BODY_BYTES,
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

  const result = handleModelResponseStream(payload.data, { traceId });
  const responseBody = result.body ?? {};

  if (result.status >= 400 || responseBody.ok === false) {
    logError("modelResponse", "response_sent", {
      direction: "中转服务→语音服务",
      route,
      service: "语音服务",
      traceId,
      robotId: responseBody.robotId ?? payload.data?.robotId,
      wholeSessionId: responseBody.sessionId,
      turnId: responseBody.turnId ?? payload.data?.sessionId,
      responseId: responseBody.responseId,
      contentLength: typeof payload.data?.content === "string" ? payload.data.content.length : 0,
      statusCode: result.status,
      outcome: "失败",
      reason: responseBody.error,
      durationMs: Date.now() - startedAt,
    });
  }

  return toJsonResponse(result);
}
