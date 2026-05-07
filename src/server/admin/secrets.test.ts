import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_HEX = "0".repeat(60) + "abcd";

const setupTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "billy-secrets-"));
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "billy.db")}`);
  return dir;
};

const loadSecrets = async () => {
  vi.resetModules();
  return import("@/server/admin/secrets");
};

describe("admin/secrets", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts a string round-trip with env-provided secret", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const { encryptString, decryptString, __resetForTests } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("sk-test-12345", "provider_key:openai");
    expect(blob.v).toBe(1);
    expect(blob.iv).toBeTypeOf("string");
    expect(blob.tag).toBeTypeOf("string");
    expect(blob.ct).toBeTypeOf("string");

    const plain = await decryptString(blob, "provider_key:openai");
    expect(plain).toBe("sk-test-12345");
  });

  it("rejects invalid hex master secret", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", "not-hex-zzz");
    const { encryptString, __resetForTests, SecretsConfigError } = await loadSecrets();
    __resetForTests();

    await expect(encryptString("x", "label")).rejects.toBeInstanceOf(SecretsConfigError);
  });

  it("rejects wrong-length hex master secret", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", "abcd");
    const { encryptString, __resetForTests, SecretsConfigError } = await loadSecrets();
    __resetForTests();

    await expect(encryptString("x", "label")).rejects.toBeInstanceOf(SecretsConfigError);
  });

  it("auto-generates and persists a key file when env secret absent", async () => {
    const dir = setupTmpDir();
    const { encryptString, decryptString, __resetForTests } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("hello", "label");
    const decoded = await decryptString(blob, "label");
    expect(decoded).toBe("hello");

    const keyFile = join(dir, ".encryption-key");
    const stat = statSync(keyFile);
    expect(stat.size).toBe(32);
    expect(stat.mode & 0o777).toBe(0o600);

    __resetForTests();
    const blob2 = await encryptString("world", "label");
    const decoded2 = await decryptString(blob2, "label");
    expect(decoded2).toBe("world");
  });

  it("rejects key file of wrong length", async () => {
    const dir = setupTmpDir();
    const keyFile = join(dir, ".encryption-key");
    writeFileSync(keyFile, "short", { mode: 0o600 });

    const { encryptString, __resetForTests, SecretsConfigError } = await loadSecrets();
    __resetForTests();

    await expect(encryptString("x", "label")).rejects.toBeInstanceOf(SecretsConfigError);
  });

  it("rejects decrypt with wrong AAD label", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const { encryptString, decryptString, __resetForTests, SecretsDecryptError } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("sensitive", "provider_key:openai");
    await expect(decryptString(blob, "provider_key:anthropic")).rejects.toBeInstanceOf(SecretsDecryptError);
  });

  it("rejects decrypt with tampered ciphertext", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const { encryptString, decryptString, __resetForTests, SecretsDecryptError } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("sensitive", "label");
    const tampered = { ...blob, ct: Buffer.from("garbage").toString("base64") };
    await expect(decryptString(tampered, "label")).rejects.toBeInstanceOf(SecretsDecryptError);
  });

  it("decrypts with a different master key fails (rotation broke prior data)", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const first = await loadSecrets();
    first.__resetForTests();
    const blob = await first.encryptString("payload", "label");

    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", "1".repeat(64));
    const second = await loadSecrets();
    second.__resetForTests();

    await expect(second.decryptString(blob, "label")).rejects.toBeInstanceOf(second.SecretsDecryptError);
  });

  it("parseBlob round-trips through serializeBlob", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const { encryptString, serializeBlob, parseBlob, __resetForTests } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("v", "label");
    const serialized = serializeBlob(blob);
    const parsed = parseBlob(serialized);
    expect(parsed).toEqual(blob);

    expect(parseBlob("not json")).toBeNull();
    expect(parseBlob(JSON.stringify({ v: 2 }))).toBeNull();
  });

  it("does not include plaintext or master key in error messages", async () => {
    setupTmpDir();
    vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
    const { encryptString, decryptString, __resetForTests } = await loadSecrets();
    __resetForTests();

    const blob = await encryptString("super-secret-value", "label");
    try {
      await decryptString({ ...blob, tag: Buffer.from("0".repeat(16)).toString("base64") }, "label");
      expect.fail("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("super-secret-value");
      expect(msg).not.toContain(TEST_HEX);
    }
  });

  // Use the readFile helper to silence unused-import warnings on platforms
  // where the assertions above already cover key-file inspection.
  void readFileSync;
});
