const DEFAULT_CONTROL_SERVICE_BASE_URL = "http://localhost:4001";
const DEFAULT_CONTROL_SERVICE_TIMEOUT_MS = 5000;
const MAX_CONTROL_SERVICE_TIMEOUT_MS = 30000;

function readControlServiceBaseUrl(value) {
  const baseUrl = value || DEFAULT_CONTROL_SERVICE_BASE_URL;
  const parsedUrl = new URL(baseUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("CONTROL_SERVICE_BASE_URL must use http or https");
  }

  return parsedUrl.toString();
}

function readControlServiceTimeout(value) {
  const timeoutMs = value === undefined
    ? DEFAULT_CONTROL_SERVICE_TIMEOUT_MS
    : Number(value);

  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_CONTROL_SERVICE_TIMEOUT_MS
  ) {
    throw new Error(
      `CONTROL_SERVICE_TIMEOUT_MS must be between 1 and ${MAX_CONTROL_SERVICE_TIMEOUT_MS}`,
    );
  }

  return timeoutMs;
}

export const controlServiceConfig = {
  baseUrl: readControlServiceBaseUrl(process.env.CONTROL_SERVICE_BASE_URL),
  timeoutMs: readControlServiceTimeout(process.env.CONTROL_SERVICE_TIMEOUT_MS),
};
