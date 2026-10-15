export function isWorkbenchApiHealthPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (data.ok === true && data.service === "mowen-commercial-api") return true;
  return data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "database");
}
