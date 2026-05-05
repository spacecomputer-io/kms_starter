import { OrbitportSDKError } from "@spacecomputer-io/orbitport-sdk-ts";
import { NextResponse } from "next/server";

import { sdk } from "@/lib/server/orbitport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const created = await sdk.kms.createKey({
      alias: `demo-eth-${Date.now()}`,
      keySpec: "ECC_SECG_P256K1",
      keyUsage: "SIGN_VERIFY",
      scheme: "ETHEREUM",
      description: "",
      tags: [],
    });
    const { KeyId, Address } = created.data.KeyMetadata;
    return NextResponse.json({ keyId: KeyId, address: Address });
  } catch (err) {
    if (err instanceof OrbitportSDKError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
