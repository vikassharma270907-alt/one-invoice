import { NextResponse } from "next/server";

export function notImplemented(operation: string) {
  return NextResponse.json(
    {
      error: "NOT_IMPLEMENTED",
      operation,
      detail:
        "The foundation is read-only. No Airwallex call, approval, or money-moving action was performed.",
      liveCalls: false,
    },
    { status: 501 },
  );
}
