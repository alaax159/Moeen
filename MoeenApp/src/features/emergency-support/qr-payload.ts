const EMERGENCY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const RESPONDER_BASE_URL_PATTERN =
  /^(https?):\/\/(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^\s?#\\]*)?$/i;
const HOST_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isCanonicalEmergencyToken(rawToken: string): boolean {
  return EMERGENCY_TOKEN_PATTERN.test(rawToken);
}

function isValidHostname(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const address = hostname.slice(1, -1);
    const halves = address.split("::");
    if (halves.length > 2) return false;

    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const groups = [...left, ...right];
    if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
      return false;
    }

    return halves.length === 2 ? groups.length < 8 : groups.length === 8;
  }

  const labels = hostname.split(".");
  if (!labels.every((label) => HOST_LABEL_PATTERN.test(label))) return false;

  if (/^\d+(?:\.\d+){3}$/.test(hostname)) {
    return labels.every((label) => Number(label) <= 255);
  }

  return true;
}

export function normalizeResponderBaseUrl(
  value: string | undefined,
): string | null {
  if (!value) return null;

  const match = RESPONDER_BASE_URL_PATTERN.exec(value);
  if (!match) return null;

  const [, rawProtocol, rawHostname, rawPort, rawPath = ""] = match;
  const protocol = rawProtocol.toLowerCase();
  const hostname = rawHostname.toLowerCase();
  const isLocalDevelopment =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";

  if (
    !isValidHostname(hostname) ||
    (rawPort !== undefined && Number(rawPort) > 65535) ||
    (protocol !== "https" && !(protocol === "http" && isLocalDevelopment)) ||
    rawPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  const port = rawPort ? `:${rawPort}` : "";
  const path = rawPath.replace(/\/+$/, "");
  return `${protocol}://${hostname}${port}${path}`;
}

/** Keeps QR URL construction separate from the credential lifecycle. */
export function buildEmergencyQrPayload(
  rawToken: string,
  configuredBaseUrl = process.env.EXPO_PUBLIC_EMERGENCY_RESPONDER_BASE_URL,
): string | null {
  const baseUrl = normalizeResponderBaseUrl(configuredBaseUrl);
  if (!baseUrl || !isCanonicalEmergencyToken(rawToken)) return null;

  return `${baseUrl}/e#token=${rawToken}`;
}
