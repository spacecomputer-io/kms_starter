import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const chain = sepolia;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
});

export function etherscanTxUrl(hash: string) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function etherscanAddressUrl(address: string) {
  return `https://sepolia.etherscan.io/address/${address}`;
}
