import type { Metadata } from "next";
import "@fontsource-variable/rubik";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eastern State KPI Intelligence",
  description:
    "Internal KPI intelligence dashboard for Eastern State Penitentiary Historic Site.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
