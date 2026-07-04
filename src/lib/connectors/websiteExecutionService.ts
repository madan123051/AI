import { createSign } from "node:crypto";
import type { Approval, ConnectorExecutionResult, Message } from "@/lib/types";

type FirestoreField =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { mapValue: { fields: Record<string, FirestoreField> } }
  | { arrayValue: { values: FirestoreField[] } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreField>;
};

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

type WebsiteCommentTarget = {
  originalCommentId: string;
  targetType: "photo" | "story" | "video";
  targetId: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstTextValue(records: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = textValue(record[key]);

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function validTargetType(value: string): WebsiteCommentTarget["targetType"] | undefined {
  if (value === "photo" || value === "story" || value === "video") {
    return value;
  }

  return undefined;
}

function firestoreField(value: unknown): FirestoreField | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(firestoreField).filter((field): field is FirestoreField => Boolean(field)),
      },
    };
  }

  if (typeof value === "object") {
    return { mapValue: { fields: firestoreFields(value as Record<string, unknown>) } };
  }

  return { stringValue: String(value) };
}

function firestoreFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, firestoreField(value)] as const)
      .filter((entry): entry is readonly [string, FirestoreField] => Boolean(entry[1])),
  );
}

function valueFromFirestoreField(field: FirestoreField | undefined): unknown {
  if (!field) {
    return undefined;
  }

  if ("stringValue" in field) {
    return field.stringValue;
  }

  if ("booleanValue" in field) {
    return field.booleanValue;
  }

  if ("integerValue" in field) {
    return Number(field.integerValue);
  }

  if ("doubleValue" in field) {
    return field.doubleValue;
  }

  if ("timestampValue" in field) {
    return field.timestampValue;
  }

  if ("arrayValue" in field) {
    return field.arrayValue.values.map(valueFromFirestoreField);
  }

  if ("mapValue" in field) {
    return Object.fromEntries(
      Object.entries(field.mapValue.fields).map(([key, value]) => [key, valueFromFirestoreField(value)]),
    );
  }

  return null;
}

function firestoreDocumentData(document: FirestoreDocument | undefined) {
  if (!document?.fields) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(document.fields).map(([key, value]) => [key, valueFromFirestoreField(value)]),
  ) as Record<string, unknown>;
}

function firebaseProjectId() {
  return process.env.WILDSAURA_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? firebaseServiceAccount()?.project_id ?? "";
}

function firebaseApiKey() {
  return process.env.WILDSAURA_FIREBASE_API_KEY ?? process.env.FIREBASE_API_KEY ?? "";
}

function parseServiceAccountJson(value: string): FirebaseServiceAccount | undefined {
  try {
    return JSON.parse(value) as FirebaseServiceAccount;
  } catch {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as FirebaseServiceAccount;
    } catch {
      return undefined;
    }
  }
}

function firebaseServiceAccount() {
  const rawJson = process.env.WILDSAURA_FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";

  if (rawJson) {
    const parsed = parseServiceAccountJson(rawJson);

    if (parsed?.client_email && parsed.private_key) {
      return {
        ...parsed,
        private_key: parsed.private_key.replace(/\\n/g, "\n"),
      };
    }
  }

  const clientEmail = process.env.WILDSAURA_FIREBASE_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const privateKey = process.env.WILDSAURA_FIREBASE_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY ?? "";

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
      project_id: process.env.WILDSAURA_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
    };
  }

  return undefined;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getServiceAccountAccessToken() {
  const serviceAccount = firebaseServiceAccount();

  if (!serviceAccount) {
    return "";
  }

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedJwt = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(serviceAccount.private_key);
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Firebase service account token request failed (${response.status}): ${await response.text()}`);
  }

  const tokenResponse = (await response.json()) as { access_token?: string; expires_in?: number };

  if (!tokenResponse.access_token) {
    throw new Error("Firebase service account token response did not include an access token.");
  }

  cachedAccessToken = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
  };

  return cachedAccessToken.token;
}

function firestoreDocumentUrl(collectionName: string, documentId?: string) {
  const projectId = firebaseProjectId();
  const apiKey = firebaseApiKey();

  if (!projectId) {
    throw new Error("Wildsaura Firebase project ID is not configured.");
  }

  const encodedCollection = collectionName.split("/").map(encodeURIComponent).join("/");
  const encodedDocumentId = documentId ? `/${encodeURIComponent(documentId)}` : "";
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodedCollection}${encodedDocumentId}`,
  );

  if (!firebaseServiceAccount() && apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url;
}

async function firestoreHeaders(hasBody = false) {
  const headers: Record<string, string> = {};
  const token = await getServiceAccountAccessToken();

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (!firebaseApiKey()) {
    throw new Error("Wildsaura Firebase API key or service account credentials are not configured.");
  }

  return headers;
}

function documentIdFromName(name?: string) {
  return name?.split("/").pop() ?? "";
}

async function getFirestoreDocument(collectionName: string, documentId: string) {
  const response = await fetch(firestoreDocumentUrl(collectionName, documentId), {
    method: "GET",
    headers: await firestoreHeaders(),
    cache: "no-store",
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Firestore read failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as FirestoreDocument;
}

async function createFirestoreDocument(collectionName: string, data: Record<string, unknown>) {
  const response = await fetch(firestoreDocumentUrl(collectionName), {
    method: "POST",
    headers: await firestoreHeaders(true),
    body: JSON.stringify({ fields: firestoreFields(data) }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Firestore write failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as FirestoreDocument;
}

async function resolveWebsiteCommentTarget(approval: Approval, message?: Message): Promise<WebsiteCommentTarget> {
  const records = [approval.metadata, message?.metadata];
  let originalCommentId = firstTextValue(records, [
    "original_comment_id",
    "comment_doc_id",
    "commentId",
    "docId",
    "firestore_comment_id",
    "target_comment_id",
  ]);
  let targetType = validTargetType(firstTextValue(records, ["targetType", "target_type", "comment_target_type"]));
  let targetId = firstTextValue(records, ["targetId", "target_id", "comment_target_id"]);

  if (!originalCommentId && approval.target_type.toLowerCase().includes("comment") && approval.target_id !== message?.id) {
    originalCommentId = approval.target_id;
  }

  if (originalCommentId && (!targetType || !targetId)) {
    const originalComment = firestoreDocumentData(await getFirestoreDocument("comments", originalCommentId));

    targetType = targetType ?? validTargetType(textValue(originalComment.targetType));
    targetId = targetId || textValue(originalComment.targetId);
  }

  if (!originalCommentId || !targetType || !targetId) {
    throw new Error("Original website comment target could not be resolved from approval/message metadata.");
  }

  return { originalCommentId, targetType, targetId };
}

function pendingWebsiteMessageReply(): ConnectorExecutionResult {
  return {
    execution_status: "execution_pending",
    execution_error: "Approved, but website message reply execution is not implemented yet.",
    details: "Approved, but website message reply execution is not implemented yet.",
    log_action: "connector.website.message_reply_execution_pending",
  };
}

export async function executeWebsiteApproval(input: {
  approval: Approval;
  message?: Message;
}): Promise<ConnectorExecutionResult> {
  if (input.approval.connector !== "website") {
    return {
      execution_status: "execution_pending",
      execution_error: `Approved, but ${input.approval.connector} execution is not handled by the website connector.`,
      details: `Approved, but ${input.approval.connector} execution is not handled by the website connector.`,
      log_action: `connector.${input.approval.connector}.execution_pending`,
    };
  }

  if (input.approval.action_type === "reply_message") {
    return pendingWebsiteMessageReply();
  }

  if (input.approval.action_type !== "reply_comment") {
    return {
      execution_status: "execution_pending",
      execution_error: `Approved, but website ${input.approval.action_type} execution is not implemented yet.`,
      details: `Approved, but website ${input.approval.action_type} execution is not implemented yet.`,
      log_action: `connector.website.${input.approval.action_type}_execution_pending`,
    };
  }

  try {
    const draftText = input.approval.draft_text.trim();

    if (!draftText) {
      throw new Error("Cannot execute website reply because draft_text is empty.");
    }

    const target = await resolveWebsiteCommentTarget(input.approval, input.message);
    const now = new Date().toISOString();
    const replyDocument = await createFirestoreDocument("comments", {
      targetType: target.targetType,
      targetId: target.targetId,
      displayName: process.env.WEBSITE_REPLY_DISPLAY_NAME ?? "Wildsaura Team",
      avatarColor: process.env.WEBSITE_REPLY_AVATAR_COLOR ?? "#10b981",
      avatarUrl: process.env.WEBSITE_REPLY_AVATAR_URL ?? "",
      content: draftText,
      createdAt: now,
      source: "ai_control_center",
      isAdminReply: true,
      replyToCommentId: target.originalCommentId,
      replyToMessageId: input.message?.id ?? "",
      approvalId: input.approval.id,
    });
    const replyDocumentId = documentIdFromName(replyDocument.name);

    return {
      execution_status: "executed",
      details: `Website comment reply written to Wildsaura Firestore comments/${replyDocumentId}.`,
      log_action: "connector.website.reply_executed",
      metadata: {
        firestore_collection: "comments",
        firestore_reply_doc_id: replyDocumentId,
        firestore_original_comment_doc_id: target.originalCommentId,
        target_type: target.targetType,
        target_id: target.targetId,
        executed_at: now,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website comment reply execution failed.";

    return {
      execution_status: "failed",
      execution_error: message,
      details: message,
      log_action: "connector.website.reply_failed",
    };
  }
}
