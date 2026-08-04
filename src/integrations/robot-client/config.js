const DEFAULT_ROBOT_CLIENT_BASE_URL = "http://localhost:9000";
const DEFAULT_ROBOT_CLIENT_TIMEOUT_MS = 5000;
const MAX_ROBOT_CLIENT_TIMEOUT_MS = 30000;

function readRobotClientBaseUrl(value) {
  const baseUrl = value || DEFAULT_ROBOT_CLIENT_BASE_URL;
  const parsedUrl = new URL(baseUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("ROBOT_CLIENT_BASE_URL must use http or https");
  }

  return parsedUrl.toString();
}

function readRobotClientTimeout(value) {
  const timeoutMs = value === undefined
    ? DEFAULT_ROBOT_CLIENT_TIMEOUT_MS
    : Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_ROBOT_CLIENT_TIMEOUT_MS) {
    throw new Error(
      `ROBOT_CLIENT_TIMEOUT_MS must be between 1 and ${MAX_ROBOT_CLIENT_TIMEOUT_MS}`,
    );
  }

  return timeoutMs;
}

export const robotClientConfig = {
  baseUrl: readRobotClientBaseUrl(process.env.ROBOT_CLIENT_BASE_URL),
  robotId: process.env.ROBOT_ID || "4",
  timeoutMs: readRobotClientTimeout(process.env.ROBOT_CLIENT_TIMEOUT_MS),
};
