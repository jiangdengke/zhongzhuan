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

function isSameOriginBrowserRequest(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== new URL(request.url).origin) {
    return false;
  }

  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export async function POST(request) {
  const traceId = makeTraceId("voice-session");

  if (!isSameOriginBrowserRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin voice control is not allowed" },
      { status: 403, headers: { "x-trace-id": traceId } },
    );
  }

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
