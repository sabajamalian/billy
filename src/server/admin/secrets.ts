import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export class SecretsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsConfigError";
  }
}

export class SecretsDecryptError extends Error {
  constructor(message = "decrypt_failed") {
    super(message);
    this.name = "SecretsDecryptError";
  }
}

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const KEY_FILE_BYTES = 32;

const dataDirFromDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    return dirname(resolve(process.cwd(), filePath));
  }
  return resolve(process.cwd(), "data");
};

const keyFilePath = (): string => `${dataDirFromDatabaseUrl()}/.encryption-key`;

let cachedKey: Buffer | null = null;

const loadFromEnvSecret = (secret: string): Buffer => {
  if (!HEX_64.test(secret)) {
    throw new SecretsConfigError("BILLY_KEY_ENCRYPTION_SECRET must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(secret, "hex");
};

const loadFromKeyFile = async (): Promise<Buffer> => {
  const path = keyFilePath();
  await mkdir(dirname(path), { recursive: true });

  try {
    const handle = await open(path, "wx", 0o600);
    try {
      const fresh = randomBytes(KEY_FILE_BYTES);
      await handle.write(fresh);
      await handle.chmod(0o600);
      return fresh;
    } finally {
      await handle.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  const existing = await readFile(path);
  if (existing.length !== KEY_FILE_BYTES) {
    throw new SecretsConfigError(
      `Key file at ${path} is ${existing.length} bytes; expected ${KEY_FILE_BYTES}. Delete or replace it.`,
    );
  }
  return existing;
};

const resolveMasterKey = async (): Promise<Buffer> => {
  if (cachedKey) return cachedKey;

  const envSecret = process.env.BILLY_KEY_ENCRYPTION_SECRET;
  if (envSecret && envSecret.length > 0) {
    cachedKey = loadFromEnvSecret(envSecret);
    return cachedKey;
  }

  cachedKey = await loadFromKeyFile();
  return cachedKey;
};

export type EncryptedBlob = {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
};

const aad = (label: string) => Buffer.from(`billy:v1:${label}`);

export async function encryptString(plaintext: string, label: string): Promise<EncryptedBlob> {
  const key = await resolveMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(label));

  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: enc.toString("base64"),
  };
}

export async function decryptString(blob: EncryptedBlob, label: string): Promise<string> {
  if (!blob || blob.v !== 1 || !blob.iv || !blob.tag || !blob.ct) {
    throw new SecretsDecryptError("malformed_blob");
  }
  const key = await resolveMasterKey();

  try {
    const iv = Buffer.from(blob.iv, "base64");
    const tag = Buffer.from(blob.tag, "base64");
    const ct = Buffer.from(blob.ct, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(label));
    decipher.setAuthTag(tag);

    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    throw new SecretsDecryptError("decrypt_failed");
  }
}

export function serializeBlob(blob: EncryptedBlob): string {
  return JSON.stringify(blob);
}

export function parseBlob(raw: string): EncryptedBlob | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EncryptedBlob>;
    if (parsed && parsed.v === 1 && typeof parsed.iv === "string" && typeof parsed.tag === "string" && typeof parsed.ct === "string") {
      return parsed as EncryptedBlob;
    }
    return null;
  } catch {
    return null;
  }
}

export function __resetForTests() {
  cachedKey = null;
}
