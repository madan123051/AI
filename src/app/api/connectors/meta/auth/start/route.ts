import { NextResponse } from "next/server";
import { buildMetaOAuthUrl, metaEnvStatus, metaPermissions } from "@/lib/connectors/metaConnectorService";

export async function GET(request: Request) {
  const state = crypto.randomUUID();

  try {
    const authUrl = buildMetaOAuthUrl(request, state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route_ready: true,
        error: error instanceof Error ? error.message : "Meta OAuth start failed.",
        env: metaEnvStatus(),
        required_permissions: metaPermissions,
      },
      { status: 500 },
    );
  }
}
