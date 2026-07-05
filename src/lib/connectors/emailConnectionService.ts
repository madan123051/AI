import net from "node:net";
import tls from "node:tls";

type EmailProvider = "imap_smtp" | "gmail" | "zoho" | "microsoft_365";
type EmailEncryption = "ssl_tls" | "starttls";

export type EmailConnectorTestConfig = {
  provider?: unknown;
  email_address?: unknown;
  username?: unknown;
  imap_host?: unknown;
  imap_port?: unknown;
  imap_encryption?: unknown;
  smtp_host?: unknown;
  smtp_port?: unknown;
  smtp_encryption?: unknown;
};

export type EmailConnectorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type EmailConnectorTestResult = {
  ok: boolean;
  summary: string;
  checks: EmailConnectorCheck[];
};

type ResolvedEmailConfig = {
  provider: EmailProvider;
  emailAddress: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
};

type ReadPredicate = (text: string) => boolean;

const timeoutMs = 12_000;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serverEnvValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  const isQuoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  return isQuoted ? trimmed.slice(1, -1) : trimmed;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(textValue(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerValue(value: unknown): EmailProvider {
  const text = textValue(value);
  if (text === "gmail" || text === "zoho" || text === "microsoft_365") {
    return text;
  }

  return "imap_smtp";
}

function encryptionValue(value: unknown, fallback: EmailEncryption): EmailEncryption {
  return textValue(value) === "starttls" ? "starttls" : fallback;
}

function emailPassword() {
  return serverEnvValue(process.env.EMAIL_CONNECTOR_PASSWORD) || serverEnvValue(process.env.CUSTOM_EMAIL_PASSWORD);
}

function resolveConfig(input: EmailConnectorTestConfig): ResolvedEmailConfig {
  const provider = providerValue(input.provider);
  const configuredEmailAddress = textValue(input.email_address) || serverEnvValue(process.env.EMAIL_CONNECTOR_ADDRESS);
  const username = textValue(input.username) || serverEnvValue(process.env.EMAIL_CONNECTOR_USERNAME) || configuredEmailAddress;
  const emailAddress = configuredEmailAddress || (username.includes("@") ? username : "");

  return {
    provider,
    emailAddress,
    username,
    password: emailPassword(),
    imapHost: textValue(input.imap_host) || serverEnvValue(process.env.EMAIL_IMAP_HOST),
    imapPort: numberValue(input.imap_port ?? process.env.EMAIL_IMAP_PORT, 993),
    imapEncryption: encryptionValue(input.imap_encryption ?? process.env.EMAIL_IMAP_ENCRYPTION, "ssl_tls"),
    smtpHost: textValue(input.smtp_host) || serverEnvValue(process.env.EMAIL_SMTP_HOST),
    smtpPort: numberValue(input.smtp_port ?? process.env.EMAIL_SMTP_PORT, 465),
    smtpEncryption: encryptionValue(input.smtp_encryption ?? process.env.EMAIL_SMTP_ENCRYPTION, "ssl_tls"),
  };
}

class MailSocket {
  private buffer = "";
  private pending:
    | {
        predicate: ReadPredicate;
        resolve: (value: string) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | null = null;

  constructor(private socket: net.Socket | tls.TLSSocket) {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.flush();
    });
    this.socket.on("error", (error) => {
      this.rejectPending(error instanceof Error ? error : new Error(String(error)));
    });
    this.socket.on("end", () => {
      this.rejectPending(new Error("Connection closed by email server."));
    });
  }

  readUntil(predicate: ReadPredicate) {
    if (predicate(this.buffer)) {
      const value = this.buffer;
      this.buffer = "";
      return Promise.resolve(value);
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("Email server response timed out."));
      }, timeoutMs);

      this.pending = { predicate, resolve, reject, timer };
      this.flush();
    });
  }

  write(command: string) {
    return new Promise<void>((resolve, reject) => {
      this.socket.write(command, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  rawSocket() {
    return this.socket;
  }

  close() {
    this.socket.end();
    this.socket.destroy();
  }

  private flush() {
    if (!this.pending || !this.pending.predicate(this.buffer)) {
      return;
    }

    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    const value = this.buffer;
    this.buffer = "";
    pending.resolve(value);
  }

  private rejectPending(error: Error) {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

function connectPlain(host: string, port: number) {
  return new Promise<MailSocket>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${port} timed out.`));
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(new MailSocket(socket));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function connectTls(host: string, port: number, socket?: net.Socket) {
  return new Promise<MailSocket>((resolve, reject) => {
    const secureSocket = tls.connect({ host, port, servername: host, socket });
    const timer = setTimeout(() => {
      secureSocket.destroy();
      reject(new Error(`TLS connection to ${host}:${port} timed out.`));
    }, timeoutMs);

    secureSocket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(new MailSocket(secureSocket));
    });
    secureSocket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function smtpDone(text: string) {
  return /(?:^|\r?\n)\d{3} [\s\S]*\r?\n?$/.test(text);
}

function imapTagged(tag: string) {
  return (text: string) => new RegExp(`(?:^|\\r?\\n)${tag} (OK|NO|BAD)`, "i").test(text);
}

function okResponse(text: string) {
  return /\bOK\b/i.test(text) || /^2\d\d/m.test(text) || /^3\d\d/m.test(text);
}

async function testImap(config: ResolvedEmailConfig): Promise<EmailConnectorCheck> {
  let connection: MailSocket | undefined;

  try {
    connection = config.imapEncryption === "ssl_tls"
      ? await connectTls(config.imapHost, config.imapPort)
      : await connectPlain(config.imapHost, config.imapPort);
    await connection.readUntil((text) => text.includes("\n"));

    if (config.imapEncryption === "starttls") {
      await connection.write("A001 STARTTLS\r\n");
      const startTls = await connection.readUntil(imapTagged("A001"));
      if (!okResponse(startTls)) {
        throw new Error("IMAP STARTTLS was rejected.");
      }
      connection = await connectTls(config.imapHost, config.imapPort, connection.rawSocket());
    }

    await connection.write(`A002 LOGIN "${config.username.replace(/"/g, '\\"')}" "${config.password.replace(/"/g, '\\"')}"\r\n`);
    const login = await connection.readUntil(imapTagged("A002"));
    if (!okResponse(login)) {
      throw new Error("IMAP login was rejected.");
    }

    await connection.write("A003 LOGOUT\r\n");
    return { name: "IMAP login", ok: true, detail: `Connected to ${config.imapHost}:${config.imapPort}.` };
  } catch (error) {
    return { name: "IMAP login", ok: false, detail: error instanceof Error ? error.message : "IMAP test failed." };
  } finally {
    connection?.close();
  }
}

async function testSmtp(config: ResolvedEmailConfig): Promise<EmailConnectorCheck> {
  let connection: MailSocket | undefined;

  try {
    connection = config.smtpEncryption === "ssl_tls"
      ? await connectTls(config.smtpHost, config.smtpPort)
      : await connectPlain(config.smtpHost, config.smtpPort);
    await connection.readUntil(smtpDone);
    await connection.write("EHLO ai-control-center.local\r\n");
    await connection.readUntil(smtpDone);

    if (config.smtpEncryption === "starttls") {
      await connection.write("STARTTLS\r\n");
      const startTls = await connection.readUntil(smtpDone);
      if (!okResponse(startTls)) {
        throw new Error("SMTP STARTTLS was rejected.");
      }
      connection = await connectTls(config.smtpHost, config.smtpPort, connection.rawSocket());
      await connection.write("EHLO ai-control-center.local\r\n");
      await connection.readUntil(smtpDone);
    }

    await connection.write("AUTH LOGIN\r\n");
    const authPrompt = await connection.readUntil(smtpDone);
    if (!/^334/m.test(authPrompt)) {
      throw new Error("SMTP AUTH LOGIN was not accepted.");
    }
    await connection.write(`${Buffer.from(config.username).toString("base64")}\r\n`);
    const userPrompt = await connection.readUntil(smtpDone);
    if (!/^334/m.test(userPrompt)) {
      throw new Error("SMTP username was not accepted.");
    }
    await connection.write(`${Buffer.from(config.password).toString("base64")}\r\n`);
    const login = await connection.readUntil(smtpDone);
    if (!/^235/m.test(login)) {
      throw new Error("SMTP login was rejected.");
    }

    await connection.write("QUIT\r\n");
    return { name: "SMTP login", ok: true, detail: `Connected to ${config.smtpHost}:${config.smtpPort}.` };
  } catch (error) {
    return { name: "SMTP login", ok: false, detail: error instanceof Error ? error.message : "SMTP test failed." };
  } finally {
    connection?.close();
  }
}

export async function testEmailConnection(input: EmailConnectorTestConfig): Promise<EmailConnectorTestResult> {
  const config = resolveConfig(input);
  const checks: EmailConnectorCheck[] = [];

  if (config.provider !== "imap_smtp") {
    return {
      ok: false,
      summary: "Only IMAP/SMTP custom email can be tested in this phase. Gmail, Zoho, and Microsoft OAuth are metadata-only.",
      checks: [{ name: "Provider", ok: false, detail: "Choose IMAP/SMTP for server-side connection testing." }],
    };
  }

  if (!config.emailAddress || !config.username) {
    checks.push({ name: "Account metadata", ok: false, detail: "Email address and username are required." });
  }

  if (!config.password) {
    checks.push({ name: "Server password", ok: false, detail: "Set EMAIL_CONNECTOR_PASSWORD in server environment variables." });
  }

  if (!config.imapHost) {
    checks.push({ name: "IMAP host", ok: false, detail: "IMAP host is required." });
  }

  if (!config.smtpHost) {
    checks.push({ name: "SMTP host", ok: false, detail: "SMTP host is required." });
  }

  if (checks.some((check) => !check.ok)) {
    return {
      ok: false,
      summary: "Email connector is not ready for testing.",
      checks,
    };
  }

  const [imapCheck, smtpCheck] = await Promise.all([testImap(config), testSmtp(config)]);
  const finalChecks = [imapCheck, smtpCheck];
  const ok = finalChecks.every((check) => check.ok);

  return {
    ok,
    summary: ok ? "IMAP and SMTP login tests passed." : "One or more email connection checks failed.",
    checks: finalChecks,
  };
}
