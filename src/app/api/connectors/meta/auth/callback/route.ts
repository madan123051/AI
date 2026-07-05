import { NextResponse } from "next/server";
import { metaEnvStatus, saveMetaOAuthCallback } from "@/lib/connectors/metaConnectorService";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error") ?? "";
  const errorReason = url.searchParams.get("error_reason") ?? "";
  const errorDescription = url.searchParams.get("error_description") ?? "";

  try {
    const result = await saveMetaOAuthCallback({
      code,
      state,
      error,
      errorReason,
      errorDescription,
    });

    return NextResponse.json({
      ok: !error,
      route_ready: true,
      callback_received: true,
      has_code: Boolean(code),
      token_exchange_performed: false,
      access_tokens_saved: false,
      connector_saved: result.saved,
      connector: result.connector,
      env: metaEnvStatus(),
      error: error || undefined,
      error_reason: errorReason || undefined,
      error_description: errorDescription || undefined,
    });
  } catch (callbackError) {
    return NextResponse.json(
      {
        ok: false,
        route_ready: true,
        callback_received: true,
        token_exchange_performed: false,
        access_tokens_saved: false,
        error: callbackError instanceof Error ? callbackError.message : "Meta OAuth callback failed.",
        env: metaEnvStatus(),
      },
      { status: 500 },
    );
  }
}
