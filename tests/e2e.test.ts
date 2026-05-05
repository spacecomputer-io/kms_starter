/**
 * The whole flow in one test:
 *   create KMS key  →  fund on local chain  →  deploy Counter  →  increment()
 *
 * The only thing mocked is the Orbitport gateway. The mock keeps an in-memory
 * secp256k1 keypair and signs digests the way the real KMS would, so every
 * other layer (Next.js routes, the viem custom account in kms-account.ts, RLP
 * encoding, yParity normalization, contract deploy and call) runs the same
 * code the browser hits in production.
 *
 * The chain is real anvil, started by this file. CI installs anvil via
 * foundry-rs/foundry-toolchain@v1; locally you need it on PATH yourself.
 */
import { spawn, type Subprocess } from "bun";
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  privateKeyToAddress,
  sign as ecdsaSign,
} from "viem/accounts";
import { foundry } from "viem/chains";

const ANVIL_RPC = "http://127.0.0.1:8545";
// Anvil's well-known prefunded account #0.
const ANVIL_FUNDER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

// In-memory KMS state. The mocked createKey writes here, the mocked sign
// reads from it. One key is enough; the test only mints one.
const kmsState: { keyId: string; privkey: Hex; address: Address } = {
  keyId: "",
  privkey: "0x" as Hex,
  address: "0x" as Address,
};

mock.module("@/lib/server/orbitport", () => ({
  sdk: {
    kms: {
      createKey: async () => {
        kmsState.privkey = generatePrivateKey();
        kmsState.address = privateKeyToAddress(kmsState.privkey);
        kmsState.keyId = `kms:e2e-${Date.now()}`;
        return {
          data: {
            KeyMetadata: {
              KeyId: kmsState.keyId,
              Address: kmsState.address,
            },
          },
        };
      },
      sign: async ({
        keyId,
        message,
      }: {
        keyId: string;
        message: Uint8Array;
      }) => {
        if (keyId !== kmsState.keyId) {
          throw new Error(`unknown keyId ${keyId}`);
        }
        const digest = `0x${Buffer.from(message).toString("hex")}` as Hex;
        const sig = await ecdsaSign({
          hash: digest,
          privateKey: kmsState.privkey,
        });
        // KMS returns 65 raw bytes: r (32) || s (32) || v (1).
        const v = sig.yParity === 0 ? "1b" : "1c"; // 27/28 — splitSignature normalizes either form
        const sigHex = `0x${sig.r.slice(2)}${sig.s.slice(2)}${v}` as Hex;
        return { data: { Signature: sigHex } };
      },
    },
  },
}));

// kms-account.ts in the browser POSTs to the relative URL `/api/sign`,
// which fetch resolves against the current origin. There's no server here,
// so we intercept that relative URL and call the route handler directly.
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url === "/api/sign") {
    const { POST } = await import("@/app/api/sign/route");
    return POST(new Request(`http://test.local${url}`, init));
  }
  if (url === "/api/keys/create") {
    const { POST } = await import("@/app/api/keys/create/route");
    return POST();
  }
  return realFetch(input, init);
}) as typeof fetch;

let anvil: Subprocess | undefined;

beforeAll(async () => {
  anvil = spawn(["anvil", "--silent", "--port", "8545"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  // Poll the JSON-RPC for readiness; with --silent we can't grep stdout.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const r = await realFetch(ANVIL_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("anvil failed to start within 10s");
});

afterAll(() => {
  anvil?.kill();
});

test("create key → fund → deploy Counter → increment()", async () => {
  // 1. Mint an Ethereum key in (mocked) KMS via the real API route.
  const createRes = await fetch("/api/keys/create", { method: "POST" });
  expect(createRes.status).toBe(200);
  const { keyId, address } = (await createRes.json()) as {
    keyId: string;
    address: Address;
  };
  expect(keyId).toMatch(/^kms:/);
  expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);

  // 2. Fund the KMS-controlled address from anvil's prefunded account.
  const transport = http(ANVIL_RPC);
  const publicClient = createPublicClient({ chain: foundry, transport });
  const funder = privateKeyToAccount(ANVIL_FUNDER_PK);
  const fundClient = createWalletClient({
    account: funder,
    chain: foundry,
    transport,
  });
  const fundTx = await fundClient.sendTransaction({
    to: address,
    value: parseEther("1"),
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });
  const balance = await publicClient.getBalance({ address });
  expect(balance).toBe(parseEther("1"));

  // 3. Deploy the Counter via the same KMS-account → /api/sign path the
  //    browser uses. We import from @/lib so the test exercises the real wiring.
  const { createKmsAccount } = await import("@/lib/kms-account");
  const { COUNTER_ABI, COUNTER_BYTECODE } = await import("@/lib/contract");
  const kmsAccount = createKmsAccount({ address, keyId });
  const walletClient = createWalletClient({
    account: kmsAccount,
    chain: foundry,
    transport,
  });

  const deployHash = await walletClient.deployContract({
    account: kmsAccount,
    chain: foundry,
    abi: COUNTER_ABI,
    bytecode: COUNTER_BYTECODE,
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  expect(deployReceipt.status).toBe("success");
  const contractAddress = deployReceipt.contractAddress;
  expect(contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  if (!contractAddress) throw new Error("missing contractAddress");

  // count() starts at 0.
  let count = await publicClient.readContract({
    address: contractAddress,
    abi: COUNTER_ABI,
    functionName: "count",
  });
  expect(count).toBe(0n);

  // 4. Call increment(). Second tx through KMS, so it's clear the deploy
  //    wasn't a fluke.
  const incHash = await walletClient.writeContract({
    account: kmsAccount,
    chain: foundry,
    address: contractAddress,
    abi: COUNTER_ABI,
    functionName: "increment",
  });
  const incReceipt = await publicClient.waitForTransactionReceipt({
    hash: incHash,
  });
  expect(incReceipt.status).toBe("success");

  count = await publicClient.readContract({
    address: contractAddress,
    abi: COUNTER_ABI,
    functionName: "count",
  });
  expect(count).toBe(1n);
}, 30_000);
