import { NextResponse } from "next/server";
import {
  createInvalidModelResponseJsonResult,
  handleModelResponseMonitor,
} from "@/features/robot/application/model-response.js";
import { readJsonBody } from "@/shared/http/json.js";
import { makeTraceId } from "@/shared/logging/logger.js";

const MAX_MONITOR_BODY_BYTES = 4096;

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("model-response");
  const payload = await readJsonBody(request, {
    maxBytes: MAX_MONITOR_BODY_BYTES,
    requireJson: true,
  });

  if (!payload.ok) {
    if (payload.status !== 400) {
      return NextResponse.json(
        { ok: false, error: payload.error },
        { status: payload.status, headers: { "x-trace-id": traceId } },
      );
    }

    return toJsonResponse(createInvalidModelResponseJsonResult({ traceId }));
  }

  return toJsonResponse(handleModelResponseMonitor(payload.data, { traceId }));
}
