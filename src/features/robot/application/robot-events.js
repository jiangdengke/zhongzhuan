import { logError, logInfo } from "@/shared/logging/logger.js";

const MAX_RECENT_EVENTS = 100;
const MAX_PUBLISH_COUNTERS = 500;

function getEventState() {
  if (!globalThis.__robotEventState) {
    globalThis.__robotEventState = {
      listeners: new Set(),
      recentEvents: [],
      publishCountsByKey: new Map(),
      sequence: 0,
    };
  }

  if (!globalThis.__robotEventState.publishCountsByKey) {
    globalThis.__robotEventState.publishCountsByKey = new Map();
  }

  return globalThis.__robotEventState;
}

function shouldLogPublishedEvent(state, type, data) {
  const isHighFrequencyEvent = (
    type === "asr_partial" ||
    type === "deepseek_delta" ||
    type === "model_response_delta"
  );

  if (!isHighFrequencyEvent) {
    return true;
  }

  if (type === "asr_partial") {
    return false;
  }

  const associationId = data.responseId || data.sessionId || data.traceId || "unknown";
  const counterKey = `${type}:${associationId}`;
  const publishCount = (state.publishCountsByKey.get(counterKey) ?? 0) + 1;
  state.publishCountsByKey.set(counterKey, publishCount);

  while (state.publishCountsByKey.size > MAX_PUBLISH_COUNTERS) {
    const oldestCounterKey = state.publishCountsByKey.keys().next().value;

    if (!oldestCounterKey) {
      break;
    }

    state.publishCountsByKey.delete(oldestCounterKey);
  }

  return publishCount === 1 || publishCount % 10 === 0;
}

function createEventId(state, type) {
  state.sequence += 1;
  return `${type}-${Date.now()}-${state.sequence}`;
}

export function publishRobotEvent(type, data = {}) {
  const state = getEventState();
  const event = {
    id: createEventId(state, type),
    type,
    at: new Date().toISOString(),
    data,
  };

  state.recentEvents.push(event);
  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents.shift();
  }

  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch (error) {
      state.listeners.delete(listener);
      logError("robotEvents", "listener_failed", {
        direction: "中转服务→页面",
        eventId: event.id,
        eventType: event.type,
        wholeSessionId: data.sessionId,
        responseId: data.responseId,
        listenerCount: state.listeners.size,
        error,
      });
    }
  }

  if (shouldLogPublishedEvent(state, type, data)) {
    logInfo("robotEvents", "event_published", {
      direction: "中转服务→页面",
      eventId: event.id,
      eventType: type,
      wholeSessionId: type.startsWith("model_response_") ? data.sessionId : undefined,
      utteranceSessionId: type === "asr_partial" ? data.sessionId : undefined,
      responseId: data.responseId,
      robotId: data.robotId,
      contentLength: typeof data.content === "string" ? data.content.length : undefined,
      chunkCount: data.chunkCount,
      listenerCount: state.listeners.size,
      outcome: "已写入 SSE",
    });
  }

  return event;
}

export function readRobotEventStatus() {
  const state = getEventState();

  return {
    listenerCount: state.listeners.size,
    recentEventCount: state.recentEvents.length,
  };
}

export function subscribeRobotEvents(listener, options = {}) {
  const state = getEventState();
  state.listeners.add(listener);

  if (options.replayRecent) {
    for (const event of state.recentEvents) {
      listener({
        ...event,
        replayed: true,
      });
    }
  }

  return () => {
    state.listeners.delete(listener);
  };
}
