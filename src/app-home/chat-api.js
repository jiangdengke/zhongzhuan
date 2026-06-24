function buildSessionId() {
  return `web-chat-${Date.now()}`;
}

export function createSpeechContextPayload(content) {
  return {
    robotId: "4",
    event: "SPEECH_CONTEXT",
    language: "CN",
    content,
    sessionId: buildSessionId(),
    function: {
      name: "",
      param: "",
    },
  };
}

function parseSseBlock(block) {
  let event = "message";
  const dataLines = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}

function parseEventData(message) {
  try {
    return JSON.parse(message.data);
  } catch {
    return null;
  }
}

export function subscribeRobotEvents(handlers = {}) {
  if (typeof EventSource === "undefined") {
    return () => {};
  }

  const source = new EventSource("/robot/events");
  const eventNames = [
    "ready",
    "voice",
    "asr_partial",
    "final_input",
    "deepseek_delta",
    "tts_done",
    "robot_error",
  ];

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onerror = () => {
    handlers.onError?.();
  };

  for (const eventName of eventNames) {
    source.addEventListener(eventName, (message) => {
      handlers.onEvent?.(eventName, parseEventData(message));
    });
  }

  return () => {
    source.close();
  };
}

export async function sendChatMessageStream(content, handlers = {}) {
  const payload = createSpeechContextPayload(content);
  const response = await fetch("/robot/listenQwen/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const traceId = response.headers.get("x-trace-id") ?? "";

  handlers.onStart?.({
    payload,
    status: response.status,
    traceId,
  });

  if (!response.body) {
    throw new Error("流式响应不可读");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData = null;
  let streamTraceId = traceId;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separatorIndex = buffer.indexOf("\n\n");

      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseBlock(block);

        if (parsed?.event === "start" || parsed?.event === "meta") {
          streamTraceId = parsed.data?.traceId || streamTraceId;
          handlers.onMeta?.(parsed.data);
        }

        if (parsed?.event === "delta") {
          handlers.onDelta?.(parsed.data?.content ?? "");
        }

        if (parsed?.event === "error") {
          handlers.onError?.(parsed.data);
        }

        if (parsed?.event === "done") {
          doneData = parsed.data;
          handlers.onDone?.(parsed.data);
        }

        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    payload,
    status: response.status,
    traceId: streamTraceId,
    data: doneData,
  };
}
