import "server-only";

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

// The SDK constructor checks clientId/clientSecret eagerly, so importing this
// module without env vars throws. Next.js's page-data collection imports route
// modules at build time (even ones marked `dynamic = force-dynamic`), which
// would crash the build on any deploy that doesn't have the secrets present
// at build. The proxy below holds construction off until first property
// access; the build never trips the validator, only runtime requests do.
let _instance: OrbitportSDK | undefined;

function init(): OrbitportSDK {
  return new OrbitportSDK({
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
}

export const sdk = new Proxy({} as OrbitportSDK, {
  get(_target, prop, receiver) {
    _instance ??= init();
    return Reflect.get(_instance, prop, receiver);
  },
});
