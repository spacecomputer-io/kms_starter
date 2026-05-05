"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  formatEther,
  http,
  type Address,
  type Hash,
} from "viem";

import {
  chain,
  etherscanAddressUrl,
  etherscanTxUrl,
  publicClient,
  SEPOLIA_RPC,
} from "@/lib/chain";
import { COUNTER_ABI, COUNTER_BYTECODE } from "@/lib/contract";
import { createKmsAccount } from "@/lib/kms-account";
import {
  CONTRACT_STORAGE,
  KEY_STORAGE,
  isStoredContract,
  isStoredKey,
  loadStored,
} from "@/lib/storage";

type Status = "idle" | "running" | "done" | "error";

const FAUCET_URL =
  "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";

function shorten(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function TxLink({ hash }: { hash: Hash }) {
  return (
    <a href={etherscanTxUrl(hash)} target="_blank" rel="noreferrer">
      {shorten(hash)} ↗
    </a>
  );
}

function AddrLink({ addr }: { addr: Address }) {
  return (
    <a href={etherscanAddressUrl(addr)} target="_blank" rel="noreferrer">
      {addr} ↗
    </a>
  );
}

function Step({
  num,
  title,
  status,
  children,
}: {
  num: number;
  title: string;
  status: Status;
  children: React.ReactNode;
}) {
  const cls =
    status === "done"
      ? "step done"
      : status === "running"
        ? "step active"
        : "step";
  return (
    <section className={cls}>
      <header className="step-header">
        <span className="step-num">{status === "done" ? "✓" : num}</span>
        <span className="step-title">{title}</span>
        {status === "running" && <span className="spinner" />}
      </header>
      {children}
    </section>
  );
}

export default function Page() {
  // Step 1: KMS key
  const [keyId, setKeyId] = useState<string | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [s1, setS1] = useState<Status>("idle");
  const [s1Err, setS1Err] = useState<string | null>(null);

  // Step 2: balance
  const [balance, setBalance] = useState<bigint | null>(null);

  // Step 3: deploy
  const [contractAddress, setContractAddress] = useState<Address | null>(null);
  const [deployTx, setDeployTx] = useState<Hash | null>(null);
  const [s3, setS3] = useState<Status>("idle");
  const [s3Err, setS3Err] = useState<string | null>(null);

  // Step 4: increment
  const [count, setCount] = useState<bigint | null>(null);
  const [incTx, setIncTx] = useState<Hash | null>(null);
  const [s4, setS4] = useState<Status>("idle");
  const [s4Err, setS4Err] = useState<string | null>(null);

  useEffect(() => {
    const storage = typeof window === "undefined" ? undefined : window.localStorage;
    const k = loadStored(storage, KEY_STORAGE, isStoredKey);
    if (k) {
      setKeyId(k.keyId);
      setAddress(k.address);
      setS1("done");
    }
    const c = loadStored(storage, CONTRACT_STORAGE, isStoredContract);
    if (c) {
      setContractAddress(c.address);
      setDeployTx(c.deployTx);
      setS3("done");
    }
  }, []);

  const account = useMemo(
    () => (address && keyId ? createKmsAccount({ address, keyId }) : null),
    [address, keyId],
  );

  const walletClient = useMemo(
    () =>
      account
        ? createWalletClient({
            account,
            chain,
            transport: http(SEPOLIA_RPC),
          })
        : null,
    [account],
  );

  const createKey = useCallback(async () => {
    setS1("running");
    setS1Err(null);
    try {
      const res = await fetch("/api/keys/create", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setKeyId(body.keyId);
      setAddress(body.address);
      setS1("done");
      window.localStorage.setItem(
        KEY_STORAGE,
        JSON.stringify({ keyId: body.keyId, address: body.address }),
      );
    } catch (err) {
      setS1Err(err instanceof Error ? err.message : String(err));
      setS1("error");
    }
  }, []);

  const resetAll = useCallback(() => {
    window.localStorage.removeItem(KEY_STORAGE);
    window.localStorage.removeItem(CONTRACT_STORAGE);
    setKeyId(null);
    setAddress(null);
    setS1("idle");
    setS1Err(null);
    setBalance(null);
    setContractAddress(null);
    setDeployTx(null);
    setS3("idle");
    setS3Err(null);
    setCount(null);
    setIncTx(null);
    setS4("idle");
    setS4Err(null);
  }, []);

  // Poll balance once we have an address.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    async function poll() {
      try {
        const b = await publicClient.getBalance({ address: address! });
        if (!cancelled) setBalance(b);
      } catch {
        /* ignore transient RPC errors */
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  // Read the on-chain count whenever we have a contract address.
  const refreshCount = useCallback(async () => {
    if (!contractAddress) return;
    try {
      const c = (await publicClient.readContract({
        address: contractAddress,
        abi: COUNTER_ABI,
        functionName: "count",
      })) as bigint;
      setCount(c);
    } catch {
      /* ignore */
    }
  }, [contractAddress]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const deploy = useCallback(async () => {
    if (!walletClient || !account) return;
    setS3("running");
    setS3Err(null);
    try {
      const hash = await walletClient.deployContract({
        account,
        chain,
        abi: COUNTER_ABI,
        bytecode: COUNTER_BYTECODE,
      });
      setDeployTx(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const deployed = receipt.contractAddress;
      if (!deployed) throw new Error("deploy receipt missing contractAddress");
      setContractAddress(deployed);
      setS3("done");
      window.localStorage.setItem(
        CONTRACT_STORAGE,
        JSON.stringify({ address: deployed, deployTx: hash }),
      );
    } catch (err) {
      setS3Err(err instanceof Error ? err.message : String(err));
      setS3("error");
    }
  }, [walletClient, account]);

  const increment = useCallback(async () => {
    if (!walletClient || !account || !contractAddress) return;
    setS4("running");
    setS4Err(null);
    setIncTx(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        chain,
        address: contractAddress,
        abi: COUNTER_ABI,
        functionName: "increment",
      });
      setIncTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshCount();
      setS4("done");
    } catch (err) {
      setS4Err(err instanceof Error ? err.message : String(err));
      setS4("error");
    }
  }, [walletClient, account, contractAddress, refreshCount]);

  const s2: Status = address
    ? balance && balance > 0n
      ? "done"
      : "running"
    : "idle";

  const canDeploy = !!walletClient && !!balance && balance > 0n && !contractAddress;
  const canIncrement =
    !!walletClient && !!contractAddress && s4 !== "running";

  return (
    <main className="page">
      <h1 className="title">Deploy a contract with Orbitport KMS</h1>
      <p className="subtitle">
        The Ethereum private key never leaves the KMS. The browser builds each
        transaction with viem, sends the keccak256 digest to a Next.js route
        that calls Orbitport KMS for a signature, splices (r, s, v) back in,
        and broadcasts to Sepolia.
      </p>

      <Step num={1} title="Create an Ethereum key in Orbitport KMS" status={s1}>
        {!address && (
          <button onClick={createKey} disabled={s1 === "running"}>
            Create key
          </button>
        )}
        {keyId && address && (
          <>
            <div className="row">
              <span className="label">Key ID</span>
              <span className="value">{keyId}</span>
              <CopyButton value={keyId} />
            </div>
            <div className="row">
              <span className="label">Address</span>
              <span className="value">{address}</span>
              <CopyButton value={address} />
            </div>
            <p className="hint">
              Saved in this browser — same address on reload.{" "}
              <button type="button" className="copy-btn" onClick={resetAll}>
                reset
              </button>
            </p>
          </>
        )}
        {s1Err && <div className="error">{s1Err}</div>}
      </Step>

      <Step num={2} title="Fund the address on Sepolia" status={s2}>
        {!address && (
          <p className="hint">Create a key above to get an address to fund.</p>
        )}
        {address && (
          <>
            <p className="hint">
              Send a small amount of Sepolia ETH (0.01 is plenty) to this
              address. We poll the balance every 5s and advance automatically.
            </p>
            <div className="row">
              <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                Open Sepolia faucet ↗
              </a>
            </div>
            <div className="row">
              <span className="label">Balance</span>
              <span className="value">
                {balance === null ? "—" : `${formatEther(balance)} ETH`}
              </span>
            </div>
          </>
        )}
      </Step>

      <Step num={3} title="Deploy the Counter contract" status={s3}>
        {!contractAddress && (
          <>
            <p className="hint">
              Deploys a tiny <code>Counter</code> contract:{" "}
              <code>uint256 count</code> + <code>increment()</code>. The
              browser RLP-encodes the deploy tx, asks KMS to sign the digest,
              and broadcasts.
            </p>
            <button onClick={deploy} disabled={!canDeploy || s3 === "running"}>
              Deploy
            </button>
          </>
        )}
        {contractAddress && (
          <>
            <div className="row">
              <span className="label">Contract</span>
              <span className="value">
                <AddrLink addr={contractAddress} />
              </span>
              <CopyButton value={contractAddress} />
            </div>
            {deployTx && (
              <div className="row">
                <span className="label">Deploy tx</span>
                <span className="value">
                  <TxLink hash={deployTx} />
                </span>
              </div>
            )}
          </>
        )}
        {s3Err && <div className="error">{s3Err}</div>}
      </Step>

      <Step num={4} title="Call increment()" status={s4}>
        {!contractAddress && (
          <p className="hint">Deploy the contract above first.</p>
        )}
        {contractAddress && (
          <>
            <p className="hint">
              Each click sends a second tx through KMS — proves signing is
              repeatable, not a one-off.
            </p>
            <div className="row">
              <span className="label">count()</span>
              <span className="value">
                {count === null ? "—" : count.toString()}
              </span>
              <button
                type="button"
                className="copy-btn"
                onClick={refreshCount}
              >
                refresh
              </button>
            </div>
            <div className="row">
              <button
                onClick={increment}
                disabled={!canIncrement}
              >
                increment()
              </button>
            </div>
            {incTx && (
              <div className="row">
                <span className="label">Last tx</span>
                <span className="value">
                  <TxLink hash={incTx} />
                </span>
              </div>
            )}
          </>
        )}
        {s4Err && <div className="error">{s4Err}</div>}
      </Step>
    </main>
  );
}
