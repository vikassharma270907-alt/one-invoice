import { NextResponse } from "next/server";

import { integrationStatus } from "@/server/config";

export function GET() {
  return NextResponse.json({
    status: "ok",
    mode: "fixture",
    liveCalls: false,
    integrations: integrationStatus,
  });
}
