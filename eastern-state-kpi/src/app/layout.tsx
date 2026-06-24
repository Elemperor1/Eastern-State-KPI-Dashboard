import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eastern State KPI Intelligence",
  description:
    "Internal KPI intelligence dashboard for Eastern State Penitentiary Historic Site.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">
        {children}
      </body>
    </html>
  );
}