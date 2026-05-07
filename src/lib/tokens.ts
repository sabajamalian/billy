import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";

// Share tokens are 10 chars from a 62-char alphabet ≈ 59 bits of entropy.
// Bills auto-expire on a short TTL, so guessing is infeasible.
const URL_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const makeShareToken = customAlphabet(URL_ALPHABET, 10);

/** Public-ish token used as the bill share URL slug. 10 chars, unguessable for the bill's TTL. */
export const generateShareToken = () => makeShareToken();

/** High-entropy capability token (e.g. host token). Hex-encoded; 48 chars. */
export const generateCapabilityToken = () => randomBytes(24).toString("hex");

/**
 * Hash a capability token for storage at rest.
 *
 * We use SHA-256 (not bcrypt) for capability tokens because the input is already
 * 192 bits of entropy — slow KDFs add no security against brute force, and the
 * hash needs to be cheap enough to verify on every API request.
 *
 * For low-entropy passwords (admin), use bcrypt instead (see admin module).
 */
export const hashCapabilityToken = (token: string): string => {
  return createHash("sha256").update(token, "utf8").digest("hex");
};

/** Constant-time comparison to prevent timing-leak attacks. */
export const verifyCapabilityToken = (token: string, expectedHash: string): boolean => {
  const actualHash = hashCapabilityToken(token);
  if (actualHash.length !== expectedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
};

/** Image hash (sha256 hex) for OCR cache key. */
export const hashBytes = (bytes: Uint8Array | Buffer): string => {
  return createHash("sha256").update(bytes).digest("hex");
};
