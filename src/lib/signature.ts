import type { Hex } from "viem";

const SIG_RE = /^0x[0-9a-fA-F]{130}$/;

// Splits a 65-byte ECDSA signature (0x + 130 hex) into r, s, and yParity.
// The KMS gateway returns the recovery byte either as 0/1 or as 27/28
// depending on which path inside openbao produced it; both end up as 0/1
// here so callers don't have to care.
export function splitSignature(sigHex: Hex): {
  r: Hex;
  s: Hex;
  yParity: 0 | 1;
} {
  if (!SIG_RE.test(sigHex)) {
    throw new Error(`unexpected KMS signature shape: ${sigHex}`);
  }
  const r = `0x${sigHex.slice(2, 66)}` as Hex;
  const s = `0x${sigHex.slice(66, 130)}` as Hex;
  const vByte = parseInt(sigHex.slice(130, 132), 16);
  const yParity = (
    vByte === 27 || vByte === 28 ? vByte - 27 : vByte & 1
  ) as 0 | 1;
  return { r, s, yParity };
}
