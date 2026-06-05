import { NextResponse } from "next/server";
import { createInvalidListenJsonResult, handleListenQwen } from "@/features/robot/application/listen-qwen.js";
import { readJsonBody } from "@/shared/http/json.js";
import { makeTraceId } from "@/shared/logging/logger.js";

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const requestId = makeTraceId("listen");
  const startedAt = Date.now();
  const payload = await readJsonBody(request);

  if (!payload.ok) {
    return toJsonResponse(createInvalidListenJsonResult({ requestId, startedAt }));
  }

  return toJsonResponse(await handleListenQwen(payload.data, { requestId, startedAt }));
}
