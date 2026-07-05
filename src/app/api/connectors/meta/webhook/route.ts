import { NextResponse } from "next/server";
import {
  configuredMetaVerifyToken,
  metaEnvStatus,
  saveMetaWebhookEvent,
  summarizeMetaWebhookPayload,
} from "@/lib/connectors/metaConnectorService";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message, route_ready: true }, { status });
}

async function parseJson(request: Request) {
  try {
    const payload = await request.json();

    return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const verifyToken = configuredMetaVerifyToken();

  if (!verifyToken) {
    return jsonError("META_VERIFY_TOKEN is not configured.", 500);
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return jsonError("Meta webhook verification failed.", 403);
}

export async function POST(request: Request) {
  const payload = await parseJson(request);

  if (!payload) {
    return jsonError("Invalid Meta webhook JSON payload.", 400);
  }

  const summary = summarizeMetaWebhookPayload(payload);
  console.info("Meta webhook received", {
    object: summary.object,
    entry_count: summary.entry_count,
    entry_ids: summary.entry_ids,
    event_types: summary.event_types,
  });

  try {
    const result = await saveMetaWebhookEvent(payload);

    return NextResponse.json(
      {
        ok: true,
        route_ready: true,
        webhook_route_ready: true,
        env: metaEnvStatus(),
        summary: result.summary,
        connector: result.connector,
        action_log: result.log,
        replies_sent: false,
        posts_published: false,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route_ready: true,
        webhook_route_ready: true,
        env: metaEnvStatus(),
        summary,
        error: error instanceof Error ? error.message : "Meta webhook save failed.",
        replies_sent: false,
        posts_published: false,
      },
      { status: 500 },
    );
  }
}
