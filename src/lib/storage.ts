import type { Address, Hash } from "viem";

export const KEY_STORAGE = "kms-starter:eth-key";
export const CONTRACT_STORAGE = "kms-starter:counter";

export type StoredKey = { keyId: string; address: Address };
export type StoredContract = { address: Address; deployTx: Hash };

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const KEY_ID_RE = /^kms:[A-Za-z0-9_-]+$/;

export function isStoredKey(v: unknown): v is StoredKey {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.keyId === "string" &&
    KEY_ID_RE.test(r.keyId) &&
    typeof r.address === "string" &&
    ADDR_RE.test(r.address)
  );
}

export function isStoredContract(v: unknown): v is StoredContract {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.address === "string" &&
    ADDR_RE.test(r.address) &&
    typeof r.deployTx === "string" &&
    HASH_RE.test(r.deployTx)
  );
}

export function loadStored<T>(
  storage: Storage | undefined,
  storageKey: string,
  validate: (raw: unknown) => raw is T,
): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
