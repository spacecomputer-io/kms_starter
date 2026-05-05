import { OrbitportSDKError } from "@spacecomputer-io/orbitport-sdk-ts";
import { NextResponse } from "next/server";

import { sdk } from "@/lib/server/orbitport";
import { validateSignBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = validateSignBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const sig = await sdk.kms.sign({
      keyId: parsed.keyId,
      message: parsed.digestBytes,
      signingAlgorithm: "ETHEREUM_SECP256K1",
      messageType: "DIGEST",
    });
    return NextResponse.json({ signature: sig.data.Signature });
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
