const encoder = new TextEncoder();

export function encodeSseEvent(event, data = {}) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createSseHeaders(headers = {}) {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    ...headers,
  };
}
