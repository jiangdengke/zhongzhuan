import { ROBOT_FUNCTIONS } from "../domain/constants.js";

const COMMAND_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_COMMAND_SESSIONS = 200;
const FLIGHT_NO_PATTERN = /\b((?:CA|MU|CZ|HU|ZH|SC|MF|3U|HO|GS|EU|G5)\s*\d{3,4})\b/i;

function getCommandSessionState() {
  if (!globalThis.__robotCommandSessionState) {
    globalThis.__robotCommandSessionState = {
      sessions: new Map(),
    };
  }

  return globalThis.__robotCommandSessionState;
}

function pruneCommandSessions(state, now = Date.now()) {
  for (const [sessionId, session] of state.sessions) {
    if (now - session.createdAt > COMMAND_SESSION_TTL_MS) {
      state.sessions.delete(sessionId);
    }
  }

  while (state.sessions.size > MAX_COMMAND_SESSIONS) {
    const oldestSessionId = state.sessions.keys().next().value;

    if (!oldestSessionId) {
      return;
    }

    state.sessions.delete(oldestSessionId);
  }
}

export function readCommandSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const state = getCommandSessionState();
  pruneCommandSessions(state);

  return state.sessions.get(sessionId) || null;
}

export function rememberCommandSession(request, commandReply) {
  if (!request.sessionId) {
    return;
  }

  const state = getCommandSessionState();
  state.sessions.set(request.sessionId, {
    traceId: request.traceId,
    robotId: request.robotId,
    functionName: request.functionName,
    reply: commandReply.reply,
    createdAt: Date.now(),
  });
  pruneCommandSessions(state);
}

export function detectFlightCommand(content) {
  const match = typeof content === "string" ? content.match(FLIGHT_NO_PATTERN) : null;

  if (!match?.[1]) {
    return null;
  }

  const flightNo = match[1].replace(/\s+/g, "").toUpperCase();

  return {
    functionName: ROBOT_FUNCTIONS.flight,
    functionParam: JSON.stringify({ flightNo }),
  };
}
