const ENDED_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_ENDED_SESSIONS = 200;

function getVoiceSessionState() {
  if (!globalThis.__robotVoiceSessionState) {
    globalThis.__robotVoiceSessionState = {
      sessionsByRobotId: new Map(),
      endedSessions: new Map(),
      controlQueuesByRobotId: new Map(),
    };
  }

  return globalThis.__robotVoiceSessionState;
}

function pruneEndedSessions(state, now = Date.now()) {
  for (const [sessionId, endedAt] of state.endedSessions) {
    if (now - endedAt > ENDED_SESSION_TTL_MS) {
      state.endedSessions.delete(sessionId);
    }
  }

  while (state.endedSessions.size > MAX_ENDED_SESSIONS) {
    const oldestSessionId = state.endedSessions.keys().next().value;

    if (!oldestSessionId) {
      return;
    }

    state.endedSessions.delete(oldestSessionId);
  }
}

export function readVoiceSession(robotId) {
  return getVoiceSessionState().sessionsByRobotId.get(robotId) || null;
}

export function readActiveVoiceSession(robotId) {
  const currentSession = readVoiceSession(robotId);
  return currentSession?.phase === "active" ? currentSession : null;
}

export function rememberVoiceSession({ robotId, sessionId, phase, startedAt }) {
  const state = getVoiceSessionState();
  state.sessionsByRobotId.set(robotId, {
    robotId,
    sessionId,
    phase,
    startedAt,
  });
  state.endedSessions.delete(sessionId);
}

export function markVoiceSessionEnded({ robotId, sessionId }) {
  const state = getVoiceSessionState();
  const currentSession = state.sessionsByRobotId.get(robotId);

  if (currentSession?.sessionId === sessionId) {
    state.sessionsByRobotId.delete(robotId);
  }

  state.endedSessions.set(sessionId, Date.now());
  pruneEndedSessions(state);
}

export function isCurrentVoiceSession(robotId, sessionId) {
  const currentSession = readVoiceSession(robotId);
  return currentSession?.sessionId === sessionId;
}

export async function runVoiceSessionControlSerially(robotId, operation) {
  const state = getVoiceSessionState();
  const previousOperation = state.controlQueuesByRobotId.get(robotId) ?? Promise.resolve();
  const currentOperation = previousOperation.then(operation, operation);

  state.controlQueuesByRobotId.set(robotId, currentOperation);

  try {
    return await currentOperation;
  } finally {
    if (state.controlQueuesByRobotId.get(robotId) === currentOperation) {
      state.controlQueuesByRobotId.delete(robotId);
    }
  }
}

export function isEndedVoiceSession(sessionId) {
  if (!sessionId) {
    return false;
  }

  const state = getVoiceSessionState();
  pruneEndedSessions(state);
  return state.endedSessions.has(sessionId);
}
