import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createWebsiteConnectorMessageInDb } from "@/lib/db/controlCenterRepository";

type WebsiteConnectorPayload = {
  source?: unknown;
  type?: unknown;
  sender_name?: unknown;
  sender_handle?: unknown;
  subject?: unknown;
  body?: unknown;
  metadata?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredSecret() {
  return process.env.WEBSITE_CONNECTOR_SECRET ?? process.env.CONNECTOR_WEBHOOK_SECRET ?? "";
}

function hasValidSecret(request: Request) {
  const expected = configuredSecret();
  const provided = request.headers.get("x-connector-secret") ?? "";

  if (!expected) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function parsePayload(request: Request) {
  try {
    return (await request.json()) as WebsiteConnectorPayload;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!configuredSecret()) {
    return errorResponse("Website connector secret is not configured.", 500);
  }

  if (!hasValidSecret(request)) {
    return errorResponse("Invalid connector secret.", 401);
  }

  const payload = await parsePayload(request);

  if (!payload) {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const body = textField(payload.body);

  if (!body) {
    return errorResponse("body is required.", 400);
  }

  try {
    const result = await createWebsiteConnectorMessageInDb({
      source: textField(payload.source),
      type: textField(payload.type),
      sender_name: textField(payload.sender_name),
      sender_handle: textField(payload.sender_handle),
      subject: textField(payload.subject),
      body,
      metadata: payload.metadata,
      defaultProjectId: process.env.WEBSITE_CONNECTOR_PROJECT_ID,
    });

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        notification: result.notification,
        triage: result.triage,
        task: result.task,
        task_state: result.taskState,
        action_log: result.connectorLog,
        inbox_log: result.inboxLog,
        triage_log: result.triageLog,
        project: result.project,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website connector failed.";
    return errorResponse(message, 500);
  }
}
