/**
 * Best-effort redaction for untrusted text before it is sent to a model.
 *
 * This is a defence-in-depth helper, not a guarantee. The real integration
 * must also avoid sending full bank details, tokens or raw provider payloads.
 */
export function redactForModel(value: string): string {
  return value
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[redacted-account]")
    .replace(
      /\b(?:sk|pk|api|key|token)[-_][A-Za-z0-9_-]{8,}\b/gi,
      "[redacted-secret]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]",
    )
    .replace(/(?:\+?\d[\d ()-]{8,}\d)/g, "[redacted-number]");
}
