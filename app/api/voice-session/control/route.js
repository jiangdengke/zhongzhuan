import { NextResponse } from "next/server";
import {
  createInvalidVoiceSessionJsonResult,
  handleVoiceSessionControl,
} from "@/features/robot/application/voice-session.js";
import { readJsonBody } from "@/shared/http/json.js";
import { makeTraceId } from "@/shared/logging/logger.js";

const MAX_CONTROL_BODY_BYTES = 4096;

function toJsonResponse(result) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "x-trace-id": result.traceId },
  });
}

export async function POST(request) {
  const traceId = makeTraceId("voice-session");

  const payload = await readJsonBody(request, {
    maxBytes: MAX_CONTROL_BODY_BYTES,
    requireJson: true,
  });

  if (!payload.ok) {
    if (payload.status !== 400) {
      return NextResponse.json(
        { ok: false, error: payload.error },
        { status: payload.status, headers: { "x-trace-id": traceId } },
      );
    }

    return toJsonResponse(createInvalidVoiceSessionJsonResult({ traceId }));
  }

  return toJsonResponse(await handleVoiceSessionControl(payload.data, { traceId }));
}
