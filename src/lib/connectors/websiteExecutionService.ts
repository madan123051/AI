import { createSign, randomUUID } from "node:crypto";
import { sendEmail } from "@/lib/connectors/emailConnectionService";
import type { Approval, Connector, ConnectorExecutionResult, ContentItem, ContentRoute, MediaAsset, Message } from "@/lib/types";

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

type WebsitePublishCollection = "photos" | "stories" | "videos";

type WebsiteMediaAnalysis = {
  title?: string;
  caption?: string;
  category?: string;
  tags?: string[];
  animalName?: string;
  location?: string;
  alt_text?: string;
  excerpt?: string;
  content?: string;
};

const firebaseDatastoreScope = "https://www.googleapis.com/auth/datastore";
const firebaseStorageScope = "https://www.googleapis.com/auth/devstorage.read_write";

const cachedAccessTokens = new Map<string, { token: string; expiresAt: number }>();

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
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

function firstEmailValue(records: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const email = emailAddressValue(textValue(record[key]));

      if (email) {
        return email;
      }
    }
  }

  return "";
}

function firstArrayValue(records: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = record[key];

      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
      }

      if (typeof value === "string" && value.trim()) {
        return value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
  }

  return [];
}

function emailAddressValue(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
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

function firebaseStorageBucket() {
  const projectId = firebaseProjectId();

  return process.env.WILDSAURA_FIREBASE_STORAGE_BUCKET ??
    process.env.FIREBASE_STORAGE_BUCKET ??
    (projectId ? `${projectId}.firebasestorage.app` : "");
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

function hasFirebaseServiceAccountCredentials() {
  return Boolean(firebaseServiceAccount());
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getServiceAccountAccessToken(scope = firebaseDatastoreScope) {
  const serviceAccount = firebaseServiceAccount();

  if (!serviceAccount) {
    return "";
  }

  const cachedAccessToken = cachedAccessTokens.get(scope);

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
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

  cachedAccessTokens.set(scope, {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
  });

  return tokenResponse.access_token;
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

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `wildsaura-${Date.now()}`;
}

function isPublicMediaUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isImageDataUrl(value: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function parseImageDataUrl(value: string) {
  const match = value.trim().match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);

  if (!match) {
    throw new Error("Saved media thumbnail is not a supported base64 image data URL.");
  }

  const contentType = match[1].toLowerCase();
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

  return {
    contentType,
    extension,
    buffer: Buffer.from(match[2], "base64"),
  };
}

function uploadMetadataRecord(mediaAsset?: MediaAsset) {
  return recordOf(mediaAsset?.metadata.upload_metadata);
}

function embeddedImageDataUrlForPublish(input: { item: ContentItem; mediaAsset?: MediaAsset }) {
  return firstTextValue(
    [
      input.mediaAsset?.metadata,
      uploadMetadataRecord(input.mediaAsset),
      input.item.metadata,
      recordOf(input.mediaAsset),
    ],
    ["thumbnail_data_url", "image_data_url", "preview_data_url"],
  );
}

function storageObjectMetadataUrl(bucket: string, objectName: string) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
}

async function storageHeaders(hasBody = false) {
  const token = await getServiceAccountAccessToken(firebaseStorageScope);

  if (!token) {
    throw new Error("Wildsaura Firebase service account credentials are required for storage upload fallback.");
  }

  return {
    Authorization: `Bearer ${token}`,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function uploadImageDataUrlToFirebaseStorage(input: {
  dataUrl: string;
  item: ContentItem;
  mediaAsset?: MediaAsset;
  collection: WebsitePublishCollection;
}) {
  const bucket = firebaseStorageBucket();

  if (!bucket) {
    throw new Error("Wildsaura Firebase Storage bucket is not configured.");
  }

  const parsed = parseImageDataUrl(input.dataUrl);

  if (parsed.buffer.length <= 0) {
    throw new Error("Saved media thumbnail is empty.");
  }

  const token = randomUUID();
  const objectName = `ai-control-center/${input.collection}/${input.item.id}-${Date.now()}.${parsed.extension}`;
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);

  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", objectName);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...(await storageHeaders()),
      "Content-Type": parsed.contentType,
    },
    body: parsed.buffer,
    cache: "no-store",
  });

  if (!uploadResponse.ok) {
    throw new Error(`Firebase Storage upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`);
  }

  const uploaded = (await uploadResponse.json()) as { name?: string };
  const uploadedName = uploaded.name || objectName;
  const metadataResponse = await fetch(storageObjectMetadataUrl(bucket, uploadedName), {
    method: "PATCH",
    headers: await storageHeaders(true),
    body: JSON.stringify({
      contentType: parsed.contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
        source: "ai_control_center",
        content_item_id: input.item.id,
        media_asset_id: input.mediaAsset?.id ?? "",
      },
    }),
    cache: "no-store",
  });

  if (!metadataResponse.ok) {
    throw new Error(`Firebase Storage metadata update failed (${metadataResponse.status}): ${await metadataResponse.text()}`);
  }

  return {
    bucket,
    objectName: uploadedName,
    mediaUrl: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(uploadedName)}?alt=media&token=${encodeURIComponent(token)}`,
  };
}

function uniqueTags(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) => value.replace(/^#/, "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function safeCategory(value: string) {
  const category = value.toLowerCase().trim();
  const allowed = new Set(["wildlife", "birds", "macro", "domestic", "landscape", "street", "nature", "other"]);

  if (category === "landscapes") {
    return "landscape";
  }

  return allowed.has(category) ? category : "wildlife";
}

function compactText(value: string, maxLength = 220) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function websiteCollectionForPublish(input: {
  item: ContentItem;
  routes?: ContentRoute[];
  mediaAsset?: MediaAsset;
}): WebsitePublishCollection {
  const websiteRoute = input.routes?.find((route) => route.platform === "website") ?? input.routes?.[0];
  const targetKind = firstTextValue([websiteRoute?.metadata], ["target_kind", "collection", "target_collection"]).toLowerCase();
  const routeText = `${websiteRoute?.target_route ?? ""} ${websiteRoute?.route_label ?? ""}`.toLowerCase();

  if (targetKind.includes("video") || routeText.includes("video") || input.item.content_type === "reel" || input.mediaAsset?.asset_type === "video") {
    return "videos";
  }

  if (targetKind.includes("story") || routeText.includes("stor") || input.item.content_type === "story" || input.item.content_type === "blog") {
    return "stories";
  }

  return "photos";
}

function websiteCollectionLabel(collection: WebsitePublishCollection) {
  return collection === "photos" ? "photo" : collection === "stories" ? "story" : "video";
}

function resolvePrimaryMediaUrl(input: {
  item: ContentItem;
  mediaAsset?: MediaAsset;
  collection: WebsitePublishCollection;
}) {
  const metadataRecords = [input.mediaAsset?.metadata, input.item.metadata];
  const mediaUrl = firstTextValue(
    [
      recordOf(input.mediaAsset),
      recordOf(input.item),
      input.mediaAsset?.metadata,
      input.item.metadata,
    ],
    [
      input.collection === "videos" ? "video_url" : "image_url",
      input.collection === "videos" ? "videoUrl" : "imageUrl",
      "source_url",
      "media_url",
      "mediaUrl",
      "public_url",
      "publicUrl",
      "storage_url",
      "storageUrl",
      "storage_path",
      "storagePath",
      "media_placeholder",
    ],
  );
  const thumbnailUrl = firstTextValue(
    [
      input.mediaAsset?.metadata,
      input.item.metadata,
      recordOf(input.mediaAsset),
    ],
    ["thumbnail_url", "thumbnailUrl", "cover_image_url", "coverImageUrl", "image_url", "imageUrl", "source_url"],
  );
  const storagePath = firstTextValue([recordOf(input.mediaAsset), ...metadataRecords], ["storage_path", "storagePath"]);

  return {
    mediaUrl: isPublicMediaUrl(mediaUrl) ? mediaUrl : "",
    thumbnailUrl: isPublicMediaUrl(thumbnailUrl) ? thumbnailUrl : "",
    storagePath,
    rawMediaReference: mediaUrl || storagePath || input.item.media_placeholder,
  };
}

function recognitionPrompt(input: { item: ContentItem; mediaAsset?: MediaAsset; collection: WebsitePublishCollection }) {
  return JSON.stringify(
    {
      instruction:
        "Analyze this Wildsaura media in the same style as a nature-documentary website admin assistant. Return only JSON.",
      required_json_shape: {
        title: "short website title",
        caption: "natural caption or description",
        category: "wildlife | birds | macro | domestic | landscape | street | nature | other",
        tags: ["short tags without #"],
        animalName: "detected animal or subject, empty if unknown",
        location: "visible or inferred place, empty if unknown",
        alt_text: "accessible image/video alt text",
        excerpt: "one sentence story excerpt",
        content: "short story/body text",
      },
      context: {
        current_title: input.item.title,
        current_caption: input.item.caption_body,
        media_title: input.mediaAsset?.title,
        media_alt_text: input.mediaAsset?.alt_text,
        media_tags: input.mediaAsset?.tags ?? [],
        target_collection: input.collection,
      },
    },
    null,
    2,
  );
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? trimmed;
  return JSON.parse(fenced) as Record<string, unknown>;
}

function normalizeWebsiteAnalysis(value: Record<string, unknown>): WebsiteMediaAnalysis {
  return {
    title: textValue(value.title),
    caption: textValue(value.caption),
    category: textValue(value.category),
    tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    animalName: textValue(value.animalName) || textValue(value.animal_name),
    location: textValue(value.location),
    alt_text: textValue(value.alt_text) || textValue(value.altText),
    excerpt: textValue(value.excerpt),
    content: textValue(value.content),
  };
}

async function recognizeWebsiteMedia(input: {
  item: ContentItem;
  mediaAsset?: MediaAsset;
  collection: WebsitePublishCollection;
  analysisImageUrl: string;
}): Promise<{ analysis: WebsiteMediaAnalysis; source: "openrouter_vision" | "metadata_fallback"; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey || !input.analysisImageUrl) {
    return { analysis: {}, source: "metadata_fallback" };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "AI Handover Control Center",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_VISION_MODEL?.trim() || process.env.OPENROUTER_GPT_MODEL?.trim() || "openai/gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Wildsaura's media recognition assistant. Identify wildlife, macro subjects, scenes, and write concise nature-documentary metadata. Return valid JSON only.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: recognitionPrompt(input) },
              { type: "image_url", image_url: { url: input.analysisImageUrl } },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `OpenRouter vision request failed with ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter vision response did not include message content.");
    }

    return { analysis: normalizeWebsiteAnalysis(parseJsonObject(content)), source: "openrouter_vision" };
  } catch (error) {
    return {
      analysis: {},
      source: "metadata_fallback",
      error: error instanceof Error ? error.message : "AI media recognition failed.",
    };
  }
}

function buildWebsiteMetadata(input: {
  approval: Approval;
  item: ContentItem;
  mediaAsset?: MediaAsset;
  analysis: WebsiteMediaAnalysis;
  collection: WebsitePublishCollection;
  mediaUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  now: string;
}) {
  const metadataRecords = [recordOf(input.analysis), input.item.metadata, input.mediaAsset?.metadata, recordOf(input.mediaAsset)];
  const title =
    firstTextValue(metadataRecords, ["title", "ai_website_title", "website_title"]) ||
    input.item.title ||
    input.mediaAsset?.title ||
    "Wildsaura Field Note";
  const caption =
    input.approval.draft_text.trim() ||
    firstTextValue(metadataRecords, ["caption", "ai_caption", "ai_short_post", "ai_story_text", "alt_text", "altText"]) ||
    input.item.caption_body ||
    input.mediaAsset?.alt_text ||
    title;
  const tags = uniqueTags([
    ...firstArrayValue(metadataRecords, ["tags", "ai_hashtags"]),
    ...(input.mediaAsset?.tags ?? []),
    input.collection === "photos" ? "wildlife" : input.collection === "stories" ? "story" : "video",
  ]);
  const credit = firstTextValue([input.mediaAsset?.metadata, input.item.metadata], ["credit", "license_credit", "photographer"]) || "Wildsaura";
  const location = firstTextValue(metadataRecords, ["location"]);
  const animalName = firstTextValue(metadataRecords, ["animalName", "animal_name", "subject"]);
  const base = {
    source: "wildsaura",
    status: "approved",
    isPublic: true,
    published: true,
    createdAt: input.now,
    updatedAt: input.now,
    aiControlCenterContentItemId: input.item.id,
    aiControlCenterApprovalId: input.approval.id,
    aiControlCenterMediaAssetId: input.mediaAsset?.id ?? "",
    aiGenerated: true,
  };

  if (input.collection === "videos") {
    return {
      ...base,
      title,
      description: caption,
      videoUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl || input.mediaUrl,
      tags,
      location,
      duration: firstTextValue(metadataRecords, ["duration"]),
      viewCount: 0,
      likeCount: 0,
      liked: false,
      photographer: credit,
      storagePath: input.storagePath,
      altText: firstTextValue(metadataRecords, ["alt_text", "altText"]) || compactText(caption, 160),
    };
  }

  if (input.collection === "stories") {
    const excerpt = firstTextValue(metadataRecords, ["excerpt"]) || compactText(caption, 150);
    const content =
      firstTextValue(metadataRecords, ["content", "story_content", "ai_story_text"]) ||
      input.item.caption_body ||
      caption;

    return {
      ...base,
      title,
      slug: slugify(title),
      excerpt,
      content,
      coverImageUrl: input.mediaUrl,
      imageUrl: input.mediaUrl,
      tags,
      viewCount: 0,
      likeCount: 0,
      liked: false,
      photographer: credit,
      storagePath: input.storagePath,
      altText: firstTextValue(metadataRecords, ["alt_text", "altText"]) || compactText(caption, 160),
    };
  }

  return {
    ...base,
    slug: slugify(title),
    title,
    caption,
    category: safeCategory(firstTextValue(metadataRecords, ["category"])),
    imageUrl: input.mediaUrl,
    thumbnailUrl: input.thumbnailUrl || input.mediaUrl,
    location,
    tags,
    animalName,
    wikiSummary: firstTextValue(metadataRecords, ["wikiSummary", "wiki_summary"]),
    likeCount: 0,
    viewCount: 0,
    liked: false,
    type: "photo",
    photographer: credit,
    storagePath: input.storagePath,
    altText: firstTextValue(metadataRecords, ["alt_text", "altText"]) || compactText(caption, 160),
  };
}

async function executeWebsiteContentPublish(input: {
  approval: Approval;
  contentItem?: ContentItem;
  routes?: ContentRoute[];
  mediaAsset?: MediaAsset;
}): Promise<ConnectorExecutionResult> {
  try {
    if (!input.contentItem) {
      throw new Error("Cannot publish website content because the linked content item could not be found.");
    }

    const collection = websiteCollectionForPublish({
      item: input.contentItem,
      routes: input.routes,
      mediaAsset: input.mediaAsset,
    });
    let media = resolvePrimaryMediaUrl({
      item: input.contentItem,
      mediaAsset: input.mediaAsset,
      collection,
    });
    let storageFallback:
      | {
          bucket: string;
          objectName: string;
          mediaUrl: string;
        }
      | undefined;
    let inlineDataUrlFallbackUsed = false;
    let storageFallbackError = "";

    if (!media.mediaUrl) {
      const embeddedImageDataUrl = embeddedImageDataUrlForPublish({
        item: input.contentItem,
        mediaAsset: input.mediaAsset,
      });

      if (collection === "videos" || !isImageDataUrl(embeddedImageDataUrl)) {
        throw new Error(
          `Cannot publish ${websiteCollectionLabel(collection)} to Wildsaura because no public media URL is available. Found "${media.rawMediaReference || "empty"}". Upload the file to Supabase/Firebase Storage or paste a public media URL before approving.`,
        );
      }

      if (hasFirebaseServiceAccountCredentials()) {
        try {
          storageFallback = await uploadImageDataUrlToFirebaseStorage({
            dataUrl: embeddedImageDataUrl,
            item: input.contentItem,
            mediaAsset: input.mediaAsset,
            collection,
          });
        } catch (error) {
          storageFallbackError = error instanceof Error ? error.message : "Firebase Storage upload failed.";
          inlineDataUrlFallbackUsed = true;
        }
      }

      if (!storageFallback) {
        inlineDataUrlFallbackUsed = true;
      }

      media = {
        ...media,
        mediaUrl: storageFallback?.mediaUrl ?? embeddedImageDataUrl,
        thumbnailUrl: storageFallback?.mediaUrl ?? embeddedImageDataUrl,
        storagePath: storageFallback?.objectName ?? `inline-data-url/${input.contentItem.id}`,
      };
    }

    const now = new Date().toISOString();
    const recognition = await recognizeWebsiteMedia({
      item: input.contentItem,
      mediaAsset: input.mediaAsset,
      collection,
      analysisImageUrl: media.thumbnailUrl || media.mediaUrl,
    });
    const documentData = buildWebsiteMetadata({
      approval: input.approval,
      item: input.contentItem,
      mediaAsset: input.mediaAsset,
      analysis: recognition.analysis,
      collection,
      mediaUrl: media.mediaUrl,
      thumbnailUrl: media.thumbnailUrl,
      storagePath: media.storagePath,
      now,
    });
    const document = await createFirestoreDocument(collection, documentData);
    const documentId = documentIdFromName(document.name);
    const routeIds = input.routes?.filter((route) => route.platform === "website").map((route) => route.id) ?? [];
    const fallbackNote = inlineDataUrlFallbackUsed ? " using saved inline thumbnail fallback" : "";

    return {
      execution_status: "executed",
      details: `Website ${websiteCollectionLabel(collection)} published to Wildsaura Firestore ${collection}/${documentId}${fallbackNote}.`,
      log_action: "connector.website.publish_executed",
      metadata: {
        firestore_collection: collection,
        firestore_document_id: documentId,
        firebase_storage_bucket: storageFallback?.bucket,
        firebase_storage_object: storageFallback?.objectName,
        firebase_storage_error: storageFallbackError,
        firebase_storage_fallback_used: Boolean(storageFallback),
        inline_data_url_fallback_used: inlineDataUrlFallbackUsed,
        content_item_id: input.contentItem.id,
        media_asset_id: input.mediaAsset?.id ?? "",
        website_route_ids: routeIds,
        recognition_source: recognition.source,
        recognition_error: recognition.error,
        published_title: textValue(documentData.title),
        published_at: now,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website publish execution failed.";

    return {
      execution_status: "failed",
      execution_error: message,
      details: message,
      log_action: "connector.website.publish_failed",
    };
  }
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

function subjectForReply(message?: Message) {
  const subject = textValue(message?.subject) || "Website contact message";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function resolveEmailConnector(connectors: Connector[] | undefined, message?: Message) {
  return connectors?.find((connector) => connector.type === "email" && connector.project_id === message?.project_id) ??
    connectors?.find((connector) => connector.type === "email");
}

async function executeWebsiteMessageReply(input: {
  approval: Approval;
  message?: Message;
  connectors?: Connector[];
}): Promise<ConnectorExecutionResult> {
  try {
    const draftText = input.approval.draft_text.trim();

    if (!input.message) {
      throw new Error("Cannot send website message reply because the inbox message could not be found.");
    }

    if (!draftText) {
      throw new Error("Cannot send website message reply because draft_text is empty.");
    }

    const recipient = firstEmailValue(
      [input.approval.metadata, input.message.metadata, { sender_handle: input.message.sender_handle, sender_name: input.message.sender_name }],
      ["reply_to", "replyTo", "email", "sender_email", "from_email", "contact_email", "sender_handle", "sender", "sender_name"],
    );

    if (!recipient) {
      throw new Error("Cannot send website message reply because the contact email could not be resolved.");
    }

    const emailConnector = resolveEmailConnector(input.connectors, input.message);

    if (!emailConnector) {
      throw new Error("Cannot send website message reply because no email connector is configured for this project.");
    }

    const sent = await sendEmail({
      config: emailConnector.config,
      to: recipient,
      subject: subjectForReply(input.message),
      text: draftText,
      fromName: process.env.EMAIL_FROM_NAME ?? "Wildsaura Team",
    });
    const now = new Date().toISOString();

    return {
      execution_status: "executed",
      details: sent.detail,
      log_action: "connector.email.website_message_reply_sent",
      metadata: {
        email_connector_id: emailConnector.id,
        email_message_id: sent.messageId,
        recipient_email: recipient,
        subject: subjectForReply(input.message),
        source_message_id: input.message.id,
        executed_at: now,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website message email reply execution failed.";

    return {
      execution_status: "failed",
      execution_error: message,
      details: message,
      log_action: "connector.email.website_message_reply_failed",
    };
  }
}

export async function executeWebsiteApproval(input: {
  approval: Approval;
  message?: Message;
  connectors?: Connector[];
  contentItem?: ContentItem;
  routes?: ContentRoute[];
  mediaAsset?: MediaAsset;
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
    return executeWebsiteMessageReply(input);
  }

  if (input.approval.action_type === "publish_content") {
    return executeWebsiteContentPublish(input);
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
