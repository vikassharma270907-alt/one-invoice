import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "One Invoice · One successful payment",
  description:
    "Sandbox incident workspace for intent-bound payment recovery. Synthetic fixture data only.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
