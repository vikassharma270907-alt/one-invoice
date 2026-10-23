import "server-only";

import { z } from "zod";

const optionalNonEmpty = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const envSchema = z.object({
  AIRWALLEX_CLIENT_ID: optionalNonEmpty,
  AIRWALLEX_API_KEY: optionalNonEmpty,
  AIRWALLEX_API_BASE: optionalUrl,
  DATABASE_URL: optionalUrl,
  MODEL_API_KEY: optionalNonEmpty,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid server configuration: ${parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ")}`,
  );
}

export const serverConfig = parsed.data;

function configured(value: string | undefined): string {
  return value ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED";
}

/**
 * Status only. Never expose the values of these variables to the browser.
 * "CONFIGURED_UNVERIFIED" does not mean a provider call has succeeded.
 */
export const integrationStatus = {
  airwallex: configured(
    serverConfig.AIRWALLEX_CLIENT_ID && serverConfig.AIRWALLEX_API_KEY
      ? "present"
      : undefined,
  ),
  database: configured(serverConfig.DATABASE_URL),
  model: serverConfig.MODEL_API_KEY
    ? "CONFIGURED_UNVERIFIED"
    : "FIXTURE_ONLY",
  liveCallsEnabled: false,
  verifiedCalls: 0,
} as const;
