export const KEY_ID_RE = /^kms:[A-Za-z0-9_-]+$/;
export const DIGEST_RE = /^0x[0-9a-fA-F]{64}$/;
export const KEY_ID_MAX = 128;

export type SignBodyError = { ok: false; error: string; status: number };
export type SignBodyOk = {
  ok: true;
  keyId: string;
  digestBytes: Uint8Array;
};
export type SignBodyResult = SignBodyOk | SignBodyError;

// Validates the JSON body for /api/sign. On success returns the parsed
// values; on failure returns a (status, error) pair the route can hand
// straight to NextResponse.json without picking apart types.
export function validateSignBody(input: unknown): SignBodyResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "invalid JSON body", status: 400 };
  }
  const { keyId, digestHex } = input as {
    keyId?: unknown;
    digestHex?: unknown;
  };
  if (typeof keyId !== "string" || !KEY_ID_RE.test(keyId)) {
    return { ok: false, error: "invalid keyId", status: 400 };
  }
  if (keyId.length > KEY_ID_MAX) {
    return { ok: false, error: "keyId too long", status: 400 };
  }
  if (typeof digestHex !== "string" || !DIGEST_RE.test(digestHex)) {
    return {
      ok: false,
      error: "digestHex must be 0x + 64 hex chars",
      status: 400,
    };
  }
  return { ok: true, keyId, digestBytes: hexToBytes(digestHex) };
}

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.slice(2);
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
