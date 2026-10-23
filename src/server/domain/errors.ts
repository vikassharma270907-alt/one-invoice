export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isPgUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (typeof error !== "object" || error === null) return false;

  const record = error as { code?: unknown; constraint?: unknown };
  if (record.code !== "23505") return false;
  if (constraint === undefined) return true;
  return record.constraint === constraint;
}
