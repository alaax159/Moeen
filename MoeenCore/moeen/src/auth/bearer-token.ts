/**
 * Parses one canonical Authorization header.
 *
 * Tokens containing whitespace, trailing fields, or a different scheme are
 * rejected rather than partially accepted. Keeping this parser shared avoids
 * authentication boundaries drifting into subtly different interpretations.
 */
export function parseBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}
