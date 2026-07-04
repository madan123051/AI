"use client";

import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, Mail, Save, ShieldAlert, TestTube2 } from "lucide-react";
import type { Connector, ConnectorStatus, ConnectorType, Project } from "@/lib/types";

type EmailProvider = "imap_smtp" | "gmail" | "zoho" | "microsoft_365";
type EmailEncryption = "ssl_tls" | "starttls";

type SaveConnectorInput = {
  projectId: string;
  type: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
};

type EmailConnectorSetupPanelProps = {
  project?: Project;
  connector?: Connector;
  isSaving: boolean;
  onSaveConnector: (input: SaveConnectorInput) => Promise<void> | void;
};

const providerOptions: Array<{ value: EmailProvider; label: string }> = [
  { value: "imap_smtp", label: "IMAP/SMTP" },
  { value: "gmail", label: "Gmail" },
  { value: "zoho", label: "Zoho" },
  { value: "microsoft_365", label: "Microsoft 365" },
];

const encryptionOptions: Array<{ value: EmailEncryption; label: string }> = [
  { value: "ssl_tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
];

const statusOptions: ConnectorStatus[] = ["not_configured", "configured", "test_pending", "connected", "error"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function configString(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

function configProvider(config: Record<string, unknown> | undefined): EmailProvider {
  const value = configString(config, "provider");
  return value === "gmail" || value === "zoho" || value === "microsoft_365" ? value : "imap_smtp";
}

function configEncryption(config: Record<string, unknown> | undefined, key: string): EmailEncryption {
  const value = configString(config, key);
  return value === "starttls" ? value : "ssl_tls";
}

function statusClass(status: ConnectorStatus) {
  if (status === "connected") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "configured" || status === "test_pending") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  if (status === "error") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function portValue(config: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = config?.[key];
  return typeof value === "number" ? String(value) : typeof value === "string" ? value : fallback;
}

export function EmailConnectorSetupPanel({
  project,
  connector,
  isSaving,
  onSaveConnector,
}: EmailConnectorSetupPanelProps) {
  const [provider, setProvider] = useState<EmailProvider>(configProvider(connector?.config));
  const [status, setStatus] = useState<ConnectorStatus>(
    connector?.status && statusOptions.includes(connector.status) ? connector.status : "not_configured",
  );
  const [emailAddress, setEmailAddress] = useState(configString(connector?.config, "email_address"));
  const [imapHost, setImapHost] = useState(configString(connector?.config, "imap_host"));
  const [imapPort, setImapPort] = useState(portValue(connector?.config, "imap_port", "993"));
  const [imapEncryption, setImapEncryption] = useState<EmailEncryption>(configEncryption(connector?.config, "imap_encryption"));
  const [smtpHost, setSmtpHost] = useState(configString(connector?.config, "smtp_host"));
  const [smtpPort, setSmtpPort] = useState(portValue(connector?.config, "smtp_port", "465"));
  const [smtpEncryption, setSmtpEncryption] = useState<EmailEncryption>(configEncryption(connector?.config, "smtp_encryption"));
  const [username, setUsername] = useState(configString(connector?.config, "username"));

  const isImapProvider = provider === "imap_smtp";
  const summary = useMemo(() => {
    if (!connector) {
      return "No email connector metadata saved yet.";
    }

    const savedProvider = providerOptions.find((option) => option.value === configProvider(connector.config))?.label ?? "IMAP/SMTP";
    return `${savedProvider} metadata saved. Secrets are not stored in Supabase.`;
  }, [connector]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project) {
      return;
    }

    await onSaveConnector({
      projectId: project.id,
      type: "email",
      status,
      config: {
        provider,
        email_address: emailAddress.trim(),
        username: username.trim(),
        imap_host: isImapProvider ? imapHost.trim() : "",
        imap_port: isImapProvider ? imapPort.trim() : "",
        imap_encryption: isImapProvider ? imapEncryption : "",
        smtp_host: isImapProvider ? smtpHost.trim() : "",
        smtp_port: isImapProvider ? smtpPort.trim() : "",
        smtp_encryption: isImapProvider ? smtpEncryption : "",
        credential_storage: "server_env_variables_later",
        secrets_saved: false,
        capabilities: ["metadata_only", "test_connection_placeholder"],
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-sky-200">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-zinc-50">Custom Email Connector</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Configure domain email metadata for future IMAP inbox reading and SMTP reply approval flows.
            </p>
          </div>
        </div>
        <span className={`w-fit shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(status)}`}>{label(status)}</span>
      </div>

      <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
          <p className="text-sm leading-6 text-amber-100">
            Email password or app password must be stored only in server environment variables. This setup saves metadata only.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block text-sm text-zinc-400" htmlFor="email-provider">
          Provider
          <select
            id="email-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as EmailProvider)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="email-connector-status">
          Status
          <select
            id="email-connector-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ConnectorStatus)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{label(option)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="email-address">
          Email address
          <input
            id="email-address"
            type="email"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="help@wildsaura.com"
          />
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="email-username">
          Username
          <input
            id="email-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="help@wildsaura.com"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block text-sm text-zinc-400" htmlFor="email-password-placeholder">
          Password / app password
          <div className="relative mt-2">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              id="email-password-placeholder"
              type="password"
              disabled
              className="min-h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-9 text-sm text-zinc-500 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
              placeholder="Stored server-side later"
            />
          </div>
        </label>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Saved state</p>
          <p className="mt-1 text-sm leading-6 text-zinc-300">{summary}</p>
        </div>
      </div>

      {isImapProvider ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="block text-sm text-zinc-400" htmlFor="imap-host">
            IMAP host
            <input
              id="imap-host"
              value={imapHost}
              onChange={(event) => setImapHost(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
              placeholder="imap.example.com"
            />
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="imap-port">
            IMAP port
            <input
              id="imap-port"
              inputMode="numeric"
              value={imapPort}
              onChange={(event) => setImapPort(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
              placeholder="993"
            />
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="imap-encryption">
            IMAP encryption
            <select
              id="imap-encryption"
              value={imapEncryption}
              onChange={(event) => setImapEncryption(event.target.value as EmailEncryption)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
            >
              {encryptionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="smtp-host">
            SMTP host
            <input
              id="smtp-host"
              value={smtpHost}
              onChange={(event) => setSmtpHost(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
              placeholder="smtp.example.com"
            />
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="smtp-port">
            SMTP port
            <input
              id="smtp-port"
              inputMode="numeric"
              value={smtpPort}
              onChange={(event) => setSmtpPort(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
              placeholder="465"
            />
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="smtp-encryption">
            SMTP encryption
            <select
              id="smtp-encryption"
              value={smtpEncryption}
              onChange={(event) => setSmtpEncryption(event.target.value as EmailEncryption)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
            >
              {encryptionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm leading-6 text-zinc-400">
          {providerOptions.find((option) => option.value === provider)?.label} setup is metadata-only for now. OAuth and server-side secret storage will be added in a later phase.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={!project || isSaving}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Email Metadata
        </button>
        <button
          type="button"
          disabled
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm font-medium text-zinc-500 disabled:cursor-not-allowed"
          title="Server-side email connection test will be added later"
        >
          <TestTube2 className="h-4 w-4" aria-hidden="true" />
          Test Connection
        </button>
      </div>
    </form>
  );
}
