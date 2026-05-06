import "server-only";

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

export const sdk = new OrbitportSDK({
  config: {
    clientId: process.env.ORBITPORT_CLIENT_ID,
    clientSecret: process.env.ORBITPORT_CLIENT_SECRET,
  }
});
