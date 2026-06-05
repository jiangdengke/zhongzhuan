import { NextResponse } from "next/server";
import { createInvalidVoiceJsonResult, handleVoiceMonitor } from "@/features/robot/application/voice-monitor.js";
import { readJsonBody } from "@/shared/http/json.js";
import { makeTraceId } from "@/shared/logging/logger.js";

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("voice");
  const startedAt = Date.now();
  const payload = await readJsonBody(request);

  if (!payload.ok) {
    return toJsonResponse(createInvalidVoiceJsonResult({ traceId, startedAt }));
  }

  return toJsonResponse(handleVoiceMonitor(payload.data, { traceId, startedAt }));
}
