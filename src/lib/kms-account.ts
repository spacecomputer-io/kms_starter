import {
  keccak256,
  serializeTransaction,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { toAccount, type LocalAccount } from "viem/accounts";

import { splitSignature } from "@/lib/signature";

async function signDigestViaApi(keyId: string, digestHex: Hash): Promise<Hex> {
  const res = await fetch("/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyId, digestHex }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `sign failed (HTTP ${res.status})`);
  }
  const { signature } = (await res.json()) as { signature: Hex };
  return signature;
}

export function createKmsAccount({
  address,
  keyId,
}: {
  address: Address;
  keyId: string;
}): LocalAccount {
  return toAccount({
    address,
    async signMessage() {
      throw new Error("signMessage not implemented in this demo");
    },
    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? serializeTransaction;
      const unsigned = (await serializer(transaction)) as Hex;
      const digest = keccak256(unsigned);
      const sigHex = await signDigestViaApi(keyId, digest);
      const { r, s, yParity } = splitSignature(sigHex);
      return (await serializer(transaction, { r, s, yParity })) as Hex;
    },
    async signTypedData() {
      throw new Error("signTypedData not implemented in this demo");
    },
  });
}
