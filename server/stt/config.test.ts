import { describe, expect, it } from "vitest";

import { decodeConfig, sttSettingsSchema } from "./config.ts";
import { describeStt } from "./index.ts";

describe("decodeConfig", () => {
  it("keeps Apple as the engine and fills the defaults when nothing is configured", () => {
    expect(decodeConfig(undefined)).toEqual({ engine: "apple", url: "", model: "whisper-1", language: "", key: "" });
  });

  it("drops trailing slashes from the server address", () => {
    const config = decodeConfig({ engine: "openai-compatible", url: "https://speech.example.com/v1///" });
    expect(config.url).toBe("https://speech.example.com/v1");
  });

  it.each([
    "http://127.0.0.1:8080/v1",
    "http://localhost:8000/v1",
    "http://[::1]:8000/v1",
    "https://api.example.com/v1",
  ])("accepts %s", (url) => {
    expect(decodeConfig({ engine: "openai-compatible", url }).url).toBe(url.replace(/\/+$/, ""));
  });

  it.each([
    "http://speech.example.com/v1",
    "ftp://127.0.0.1/v1",
    "not a url",
  ])("refuses %s", (url) => {
    expect(() => decodeConfig({ engine: "openai-compatible", url })).toThrow();
  });

  it("refuses an unknown engine", () => {
    expect(() => decodeConfig({ engine: "whisper-cpp" })).toThrow();
  });

  it("refuses a language that is not a code", () => {
    expect(() => decodeConfig({ engine: "openai-compatible", language: "portugues do brasil" })).toThrow();
    expect(decodeConfig({ engine: "openai-compatible", language: "pt-BR" }).language).toBe("pt-BR");
  });

  it("applies the same address rule when a patch is saved", () => {
    expect(sttSettingsSchema.safeParse({ url: "http://speech.example.com" }).success).toBe(false);
    expect(sttSettingsSchema.safeParse({ url: "" }).success).toBe(true);
  });
});

describe("describeStt", () => {
  it("reports whether a key is saved, never the key", () => {
    const status = describeStt({ engine: "openai-compatible", url: "http://127.0.0.1:8080/v1", key: "sk-secret-123" });
    expect(status).toEqual({
      engine: "openai-compatible",
      url: "http://127.0.0.1:8080/v1",
      model: "",
      language: "",
      keyConfigured: true,
      ready: true,
    });
    expect(JSON.stringify(status)).not.toContain("sk-secret-123");
  });

  it("is Apple and not ready when nothing is configured", () => {
    expect(describeStt(undefined)).toMatchObject({ engine: "apple", keyConfigured: false, ready: false });
  });
});
