/**
 * Quick probe. Given an existing keyId (or one it creates on the fly), this
 * tries kms.Sign with each messageType and reports which ones come back with
 * signatures that actually recover the KMS address. Useful when the gateway
 * or its openbao plugin changes behavior and you want to know which signing
 * path is currently sane.
 *
 * Run: `bun scripts/probe-sign.ts [keyId]`
 */
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";
import {
  hashMessage,
  keccak256,
  recoverAddress,
  toBytes,
  type Hex,
} from "viem";

const sdk = new OrbitportSDK({
  config: {
    apiUrl: process.env.OP_BASE_URL ?? "https://op.spacecomputer.io",
    authDomain: process.env.OP_AUTH_DOMAIN ?? "auth.spacecomputer.io",
    audience:
      process.env.OP_AUTH_AUDIENCE ?? "https://op.spacecomputer.io/api",
    clientId: process.env.OP_CLIENT_ID ?? "",
    clientSecret: process.env.OP_CLIENT_SECRET ?? "",
  },
  debug: !!process.env.OP_DEBUG,
});

const keyId = process.argv[2];

async function ensureKey(): Promise<{ keyId: string; address: Hex }> {
  if (keyId) {
    // We don't know the address from a keyId alone in this SDK; rely on user-
    // provided keyId for sign-only probes and skip address-recovery checks.
    return { keyId, address: "0x0000000000000000000000000000000000000000" };
  }
  console.log("creating fresh ETHEREUM key…");
  const created = await sdk.kms.createKey({
    alias: `probe-eth-${Date.now()}`,
    keySpec: "ECC_SECG_P256K1",
    keyUsage: "SIGN_VERIFY",
    scheme: "ETHEREUM",
    description: "",
    tags: [],
  });
  console.log("  KeyId:", created.data.KeyMetadata.KeyId);
  console.log("  Address:", created.data.KeyMetadata.Address);
  return {
    keyId: created.data.KeyMetadata.KeyId,
    address: created.data.KeyMetadata.Address as Hex,
  };
}

async function recoverFrom(sig: Hex, hash: Hex): Promise<Hex> {
  return recoverAddress({ hash, signature: sig });
}

async function probe() {
  const { keyId: id, address } = await ensureKey();

  // 32-byte deterministic digest for repeatable comparisons.
  const digest = new Uint8Array(32);
  for (let i = 0; i < 32; i++) digest[i] = i + 1;
  const digestHex = `0x${Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  // For RAW + EIP191, we need a "message". Use the same 32 bytes encoded as
  // an Ethereum-style hex string so we can compare what the plugin produces.
  const msgString = "probe message";

  for (const [label, payload] of [
    [
      "EIP191 (string message)",
      {
        keyId: id,
        message: msgString,
        signingAlgorithm: "ETHEREUM_SECP256K1" as const,
        messageType: "EIP191" as const,
      },
    ],
    [
      "RAW (string message)",
      {
        keyId: id,
        message: msgString,
        signingAlgorithm: "ETHEREUM_SECP256K1" as const,
        messageType: "RAW" as const,
      },
    ],
    [
      "RAW (32 raw bytes)",
      {
        keyId: id,
        message: digest,
        signingAlgorithm: "ETHEREUM_SECP256K1" as const,
        messageType: "RAW" as const,
      },
    ],
    [
      "DIGEST (32 raw bytes)",
      {
        keyId: id,
        message: digest,
        signingAlgorithm: "ETHEREUM_SECP256K1" as const,
        messageType: "DIGEST" as const,
      },
    ],
    [
      "DIGEST (hex string)",
      {
        keyId: id,
        message: digestHex,
        signingAlgorithm: "ETHEREUM_SECP256K1" as const,
        messageType: "DIGEST" as const,
      },
    ],
  ] as const) {
    process.stdout.write(`\n${label} → `);
    try {
      const res = await sdk.kms.sign(payload);
      console.log(`OK ${res.data.Signature}`);
    } catch (err) {
      const e = err as { code?: string; status?: number; message: string };
      console.log(
        `FAIL [${e.status ?? "?"} ${e.code ?? "?"}] ${e.message}`,
      );
    }
  }

  console.log(`\ndigest used: ${digestHex}`);
  console.log(`message used: "${msgString}"`);

  if (address === "0x0000000000000000000000000000000000000000") {
    console.log("\n(no address known — pass `address=0x…` to enable recovery checks)");
    return;
  }

  console.log(`\nKMS address: ${address}`);

  // For RAW(32 bytes), check whether the plugin signs keccak256(bytes) (good
  // for tx hashes) or wraps it with EIP-191 prefix (won't recover correctly).
  const rawSig = (
    await sdk.kms.sign({
      keyId: id,
      message: digest,
      signingAlgorithm: "ETHEREUM_SECP256K1",
      messageType: "RAW",
    })
  ).data.Signature as Hex;

  const directHash = keccak256(digest);
  const eip191Hash = hashMessage({ raw: digest });

  console.log(`\nRAW(32B) signature: ${rawSig}`);
  console.log(`recovers as keccak256(bytes)?       → ${await recoverFrom(rawSig, directHash)}`);
  console.log(`recovers as EIP-191 prefixed hash?  → ${await recoverFrom(rawSig, eip191Hash)}`);
  console.log(`recovers signing bytes AS digest?   → ${await recoverFrom(rawSig, digestHex as Hex)}`);

  // The bug confirmed in EIP-191: plugin signs EIP-191 of the base64 ASCII.
  // Same expected here for RAW(32 bytes).
  const digestB64 = Buffer.from(digest).toString("base64");
  console.log(`recovers as EIP-191("${digestB64}")? → ${await recoverFrom(rawSig, hashMessage(digestB64))}`);

  // Also try with v flipped (some signers return non-canonical v).
  const rFlipped = (rawSig.slice(0, -2) +
    (rawSig.slice(-2) === "00" ? "01" : "00")) as Hex;
  console.log(`\n(with v flipped: ${rFlipped})`);
  console.log(`recovers as keccak256(bytes)?       → ${await recoverFrom(rFlipped, directHash)}`);
  console.log(`recovers signing bytes AS digest?   → ${await recoverFrom(rFlipped, digestHex as Hex)}`);

  // EIP-191 next. We want to know whether the signature recovers the KMS
  // address against the message we sent, or against something else entirely.
  const eipSig = (
    await sdk.kms.sign({
      keyId: id,
      message: msgString,
      signingAlgorithm: "ETHEREUM_SECP256K1",
      messageType: "EIP191",
    })
  ).data.Signature as Hex;
  const eip191Hash2 = hashMessage(msgString);
  console.log(`\nEIP191 sig: ${eipSig}`);
  console.log(`recovers as EIP-191(probe message)? → ${await recoverFrom(eipSig, eip191Hash2)}`);
  console.log(`recovers as keccak256("probe message")? → ${await recoverFrom(eipSig, keccak256(toBytes(msgString)))}`);

  // The SDK base64-encodes "probe message" → "cHJvYmUgbWVzc2FnZQ==".
  // Test: does the plugin EIP-191-wrap that base64 ASCII string?
  const b64 = Buffer.from(msgString, "utf-8").toString("base64");
  console.log(`\n(base64 of message: "${b64}")`);
  console.log(`recovers as EIP-191("${b64}")? → ${await recoverFrom(eipSig, hashMessage(b64))}`);
  console.log(`recovers as keccak256("${b64}")? → ${await recoverFrom(eipSig, keccak256(toBytes(b64)))}`);

  // Or: does the plugin keccak256 the base64-decoded bytes directly (no prefix)?
  console.log(`recovers as keccak256(b64-decoded bytes)? → ${await recoverFrom(eipSig, keccak256(Buffer.from(b64, "base64") as unknown as Uint8Array))}`);

  // Hex-encoded form? Some plugins want "0x{hex}"
  const hexMsg = `0x${Buffer.from(msgString, "utf-8").toString("hex")}` as Hex;
  console.log(`\n(hex of message: ${hexMsg})`);
  console.log(`recovers as EIP-191(hexMsg ascii)? → ${await recoverFrom(eipSig, hashMessage(hexMsg))}`);
}

probe().catch((err) => {
  console.error(err);
  process.exit(1);
});
