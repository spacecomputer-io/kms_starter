import "server-only";

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

const clientId = process.env.ORBITPORT_CLIENT_ID;
const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error(
    "Missing required environment variables: ORBITPORT_CLIENT_ID and " +
      "ORBITPORT_CLIENT_SECRET must both be set before starting the server. " +
      "Passing undefined credentials to the SDK produces silent authentication " +
      "failures that are difficult to diagnose at runtime."
  );
}

export const sdk = new OrbitportSDK({
  config: {
    clientId,
    clientSecret,
  },
});
