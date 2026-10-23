import { describe, expect, it } from "vitest";

import { redactForModel } from "@/server/redaction";

describe("redactForModel", () => {
  it("redacts a long account number", () => {
    expect(redactForModel("Account 1234 5678 9012 3456")).toContain(
      "[redacted-account]",
    );
  });

  it("redacts an API-key-shaped secret", () => {
    expect(redactForModel("token sk_live_abcdefghijklmnop")).toContain(
      "[redacted-secret]",
    );
  });

  it("redacts an email address", () => {
    expect(redactForModel("Contact ops@example.com")).toContain(
      "[redacted-email]",
    );
  });

  it("redacts a phone number", () => {
    const result = redactForModel("Call +1 (415) 555-0199");
    expect(result).not.toContain("415");
    expect(result).toMatch(/redacted/);
  });

  it("keeps invoice and amount text intact", () => {
    const input = "Invoice DEMO-INV-001 for USD 100.00 has not arrived.";
    expect(redactForModel(input)).toBe(input);
  });
});
