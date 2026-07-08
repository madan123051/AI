import { createSign, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

let cachedStorageAccessToken: { token: string; expiresAt: number } | null = null;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function textValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media-file";
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

function firebaseProjectId() {
  return process.env.WILDSAURA_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? firebaseServiceAccount()?.project_id ?? "";
}

function firebaseStorageBucket() {
  const projectId = firebaseProjectId();

  return process.env.WILDSAURA_FIREBASE_STORAGE_BUCKET ??
    process.env.FIREBASE_STORAGE_BUCKET ??
    (projectId ? `${projectId}.firebasestorage.app` : "");
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getStorageAccessToken() {
  const serviceAccount = firebaseServiceAccount();

  if (!serviceAccount) {
    throw new Error("Wildsaura Firebase service account credentials are required for media upload.");
  }

  if (cachedStorageAccessToken && cachedStorageAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedStorageAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
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

  cachedStorageAccessToken = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
  };

  return cachedStorageAccessToken.token;
}

function storageObjectMetadataUrl(bucket: string, objectName: string) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
}

async function uploadBufferToFirebaseStorage(input: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  projectId: string;
}) {
  const bucket = firebaseStorageBucket();

  if (!bucket) {
    throw new Error("Wildsaura Firebase Storage bucket is not configured.");
  }

  const token = await getStorageAccessToken();
  const downloadToken = randomUUID();
  const objectName = `ai-control-center/uploads/${input.projectId || "project"}/${Date.now()}-${safeFileName(input.fileName)}`;
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);

  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", objectName);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": input.contentType,
    },
    body: new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
    cache: "no-store",
  });

  if (!uploadResponse.ok) {
    throw new Error(`Firebase Storage upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`);
  }

  const uploaded = (await uploadResponse.json()) as { name?: string };
  const uploadedName = uploaded.name || objectName;
  const metadataResponse = await fetch(storageObjectMetadataUrl(bucket, uploadedName), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType: input.contentType,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        source: "ai_control_center",
        project_id: input.projectId,
      },
    }),
    cache: "no-store",
  });

  if (!metadataResponse.ok) {
    throw new Error(`Firebase Storage metadata update failed (${metadataResponse.status}): ${await metadataResponse.text()}`);
  }

  return {
    bucket,
    storage_path: uploadedName,
    source_url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(uploadedName)}?alt=media&token=${encodeURIComponent(downloadToken)}`,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = textValue(formData.get("projectId"));

    if (!(file instanceof File)) {
      return errorResponse("file is required.", 400);
    }

    if (!projectId) {
      return errorResponse("projectId is required.", 400);
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return errorResponse("Only image and video uploads are supported.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length <= 0) {
      return errorResponse("Uploaded file is empty.", 400);
    }

    const uploaded = await uploadBufferToFirebaseStorage({
      buffer,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      projectId,
    });

    return NextResponse.json({
      ok: true,
      ...uploaded,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: buffer.length,
      storage_mode: "firebase_storage",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media upload failed.";

    console.error("Media upload failed:", message);
    return errorResponse(message, 500);
  }
}
