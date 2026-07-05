import { NextResponse } from "next/server";
import { testEmailConnection, type EmailConnectorTestConfig } from "@/lib/connectors/emailConnectionService";
import { getSupabaseClient } from "@/lib/supabase";
import type { ActionLog, Connector, ConnectorStatus } from "@/lib/types";

export const runtime = "nodejs";

type TestEmailRequest = {
  projectId?: unknown;
  connectorId?: unknown;
  config?: unknown;
};

type ConnectorRow = Connector & {
  updated_at?: string | null;
};

type ActionLogRow = Partial<ActionLog> & {
  id: string;
  action: string;
  created_at: string;
  task_id?: string | null;
  project_id?: string | null;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeConnector(row: ConnectorRow): Connector {
  return {
    ...row,
    config: row.config ?? {},
    updated_at: row.updated_at ?? row.created_at,
  };
}

function normalizeLog(row: ActionLogRow): ActionLog {
  return {
    id: row.id,
    project_id: row.project_id ?? "legacy-action-logs",
    task_id: row.task_id ?? undefined,
    actor: row.actor ?? "System",
    action: row.action,
    details: row.details ?? row.action,
    created_at: row.created_at,
  };
}

function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function findExistingConnector(projectId: string, connectorId: string) {
  const supabase = getSupabaseClient();

  if (connectorId) {
    const byId = await supabase.from("connectors").select("*").eq("id", connectorId).limit(1);
    if (byId.error) {
      throw new Error(`Load email connector: ${byId.error.message}`);
    }
    const match = ((byId.data ?? []) as ConnectorRow[])[0];
    if (match) {
      return match;
    }
  }

  const byProject = await supabase
    .from("connectors")
    .select("*")
    .eq("project_id", projectId)
    .eq("type", "email")
    .limit(1);

  if (byProject.error) {
    throw new Error(`Load email connector: ${byProject.error.message}`);
  }

  return ((byProject.data ?? []) as ConnectorRow[])[0];
}

export async function POST(request: Request) {
  let body: TestEmailRequest;

  try {
    body = (await request.json()) as TestEmailRequest;
  } catch {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const connectorId = typeof body.connectorId === "string" ? body.connectorId.trim() : "";
  const requestedConfig = configRecord(body.config);

  if (!projectId) {
    return errorResponse("projectId is required.", 400);
  }

  try {
    const supabase = getSupabaseClient();
    const existing = await findExistingConnector(projectId, connectorId);
    const mergedConfig = {
      ...(existing?.config ?? {}),
      ...requestedConfig,
    };
    const testResult = await testEmailConnection(mergedConfig as EmailConnectorTestConfig);
    const now = new Date().toISOString();
    const status: ConnectorStatus = testResult.ok ? "connected" : "error";
    const config = {
      ...mergedConfig,
      credential_storage: "server_env_variables",
      password_env: "EMAIL_CONNECTOR_PASSWORD",
      secrets_saved: false,
      last_test_at: now,
      last_test_status: testResult.ok ? "passed" : "failed",
      last_test_summary: testResult.summary,
      last_test_checks: testResult.checks,
      capabilities: ["metadata", "server_side_connection_test"],
    };
    const payload = {
      project_id: projectId,
      type: "email",
      status,
      config,
      updated_at: now,
    };
    const connectorResult = existing
      ? await supabase.from("connectors").update(payload).eq("id", existing.id).select("*").single()
      : await supabase.from("connectors").insert({ ...payload, created_at: now }).select("*").single();

    if (connectorResult.error) {
      throw new Error(`Save email connector test result: ${connectorResult.error.message}`);
    }

    const logResult = await supabase
      .from("action_logs")
      .insert({
        project_id: projectId,
        actor: "Email Connector",
        action: testResult.ok ? "connector.email.test_passed" : "connector.email.test_failed",
        details: testResult.summary,
        created_at: now,
      })
      .select("*")
      .single();

    if (logResult.error) {
      throw new Error(`Create email connector test log: ${logResult.error.message}`);
    }

    return NextResponse.json(
      {
        ok: testResult.ok,
        summary: testResult.summary,
        checks: testResult.checks,
        connector: normalizeConnector(connectorResult.data as ConnectorRow),
        log: normalizeLog(logResult.data as ActionLogRow),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email connector test failed.";
    console.error("Email connector test failed:", message);
    return errorResponse(message, 500);
  }
}
