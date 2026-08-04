const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

function isJsonContentType(contentType) {
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (options.requireJson && !isJsonContentType(contentType)) {
    return {
      ok: false,
      data: null,
      status: 415,
      error: "Content-Type must be application/json",
    };
  }

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      data: null,
      status: 413,
      error: "Request body is too large",
    };
  }

  try {
    if (!request.body) {
      throw new Error("Request body is required");
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bodyText = "";
    let bodyBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bodyBytes += value.byteLength;

      if (bodyBytes > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          data: null,
          status: 413,
          error: "Request body is too large",
        };
      }

      bodyText += decoder.decode(value, { stream: true });
    }

    bodyText += decoder.decode();

    return {
      ok: true,
      data: JSON.parse(bodyText),
    };
  } catch {
    return {
      ok: false,
      data: null,
      status: 400,
      error: "Invalid JSON",
    };
  }
}
