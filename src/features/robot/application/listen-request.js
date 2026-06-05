import { readString } from "@/shared/strings.js";
import { DEFAULT_ROBOT_ID, ROBOT_EVENTS } from "../domain/constants.js";

export function createResponsePayload(robotId, content) {
  return {
    robotId,
    event: ROBOT_EVENTS.responseContext,
    content,
  };
}

export function normalizeListenPayload(payload, requestId) {
  const robotId = readString(payload?.robotId, DEFAULT_ROBOT_ID);
  const event = readString(payload?.event);
  const content = readString(payload?.content);
  const sessionId = readString(payload?.sessionId);
  const functionName = readString(payload?.function?.name);
  const functionParam = payload?.function?.param;
  const traceId = sessionId || requestId;

  return {
    robotId,
    event,
    content,
    sessionId,
    functionName,
    functionParam,
    traceId,
  };
}
