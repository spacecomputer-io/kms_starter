import type { Hex } from "viem";

// Counter.sol — solc 0.8.26, optimizer 200 runs.
//
// pragma solidity 0.8.26;
// contract Counter {
//   uint256 public count;
//   event Incremented(uint256 newCount);
//   function increment() public { unchecked { count += 1; } emit Incremented(count); }
// }
export const COUNTER_BYTECODE: Hex =
  "0x6080604052348015600e575f80fd5b5060ca80601a5f395ff3fe6080604052348015600e575f80fd5b50600436106030575f3560e01c806306661abd146034578063d09de08a14604d575b5f80fd5b603b5f5481565b60405190815260200160405180910390f35b60536055565b005b5f8054600101908190556040519081527f20d8a6f5a693f9d1d627a598e8820f7a55ee74c183aa8f1a30e8d4e8dd9a8d849060200160405180910390a156fea2646970667358221220670c343d754a0300deb8414cc70f43b2f1abc31b700abfc6f36db3c53af894df64736f6c634300081a0033";

export const COUNTER_ABI = [
  {
    type: "function",
    name: "count",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "increment",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Incremented",
    inputs: [{ name: "newCount", type: "uint256", indexed: false }],
    anonymous: false,
  },
] as const;
