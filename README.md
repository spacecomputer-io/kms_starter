# kms_starter

A small Next.js demo that deploys a Solidity contract on Sepolia from the
browser, then calls `increment()` on it. The signing key lives inside Orbitport
KMS the whole time and never reaches the browser. The Next.js backend holds the
OAuth client credentials and only proxies two calls: `kms.CreateKey` and
`kms.Sign`.

Targets the gateway at `https://op.spacecomputer.io` by default.

## What it does

1. Create an Ethereum key in Orbitport KMS (`ECC_SECG_P256K1` / `ETHEREUM`
   scheme). The browser receives `{ keyId, address }` and stashes both in
   `localStorage` so reloads keep the same address.
2. Fund the address on Sepolia. Manual step; the page links to a faucet and
   polls the balance from a public RPC.
3. Deploy the Counter contract. The browser RLP-encodes the deploy tx, hashes
   it with `keccak256`, sends the digest to `/api/sign`. The server calls
   `sdk.kms.sign({ messageType: "DIGEST", signingAlgorithm: "ETHEREUM_SECP256K1" })`
   and returns the 65-byte signature. The browser splices `(r, s, yParity)`
   into the signed tx and broadcasts it. The deployed contract address is
   persisted too.
4. Call `increment()`. Same signing flow as deploy, but going through
   `writeContract`.

```
Browser ─► /api/keys/create ─► sdk.kms.createKey  → { keyId, address }
Browser ─► public Sepolia RPC (publicnode) for nonce / gas / balance / broadcast
Browser   builds unsigned EIP-1559 tx with viem, computes keccak256
Browser ─► /api/sign         ─► sdk.kms.sign (DIGEST, ETHEREUM_SECP256K1)
                                            → 0x{r 32B}{s 32B}{v 1B}
Browser   splices (r, s, yParity) into a signed serialized tx
Browser ─► public Sepolia RPC (eth_sendRawTransaction)
```

## Setup

```bash
bun install
cp .env.example .env   # fill in ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET
```

You'll need an Orbitport **Client ID** and **Client Secret**. Sign in at
<https://accounts.spacecomputer.io/> to get them.

### Env (server-only, never expose as `NEXT_PUBLIC_*`)

| Var | Purpose |
| --- | --- |
| `ORBITPORT_CLIENT_ID` | OAuth client ID (required) |
| `ORBITPORT_CLIENT_SECRET` | OAuth client secret (required) |

The SDK targets `https://op.spacecomputer.io` (auth at `auth.spacecomputer.io`) by default. To point at a different gateway, edit `src/lib/server/orbitport.ts`.

## Run

```bash
bun run dev      # next dev on http://localhost:3000
bun run build    # next build (typechecks too)
bun run start    # next start (after build)
bun test         # e2e against anvil + mocked KMS (needs `anvil` on PATH)
```

Open the page and walk through the four steps. Step 2 wants you to send
Sepolia ETH to the displayed address from any
[Sepolia faucet](https://abetterfaucet.xyz/).
