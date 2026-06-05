export function readString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
