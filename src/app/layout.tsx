import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strategic Plan",
  description: "Internal strategic plan reporting and decision support.",
  robots: { index: false, follow: false },
  icons: {
    // Multi-size .ico (16/32/48/64/128/256) for legacy browsers — generated
    // from public/logos/eastern-state-mark.png via magick. The .ico is the
    // authoritative favicon; modern browsers that prefer the SVG/PNG version
    // get the same raster via the second entry.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64 128x128 256x256", type: "image/x-icon" },
      { url: "/logos/eastern-state-mark.png", sizes: "256x256", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

/** Renders the root layout interface. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {/* Preload the two most-used Galano Grotesque weights so regular
            body text and medium headings arrive early. font-display:
            swap keeps content visible while either request is pending. */}
        <link
          rel="preload"
          href="/fonts/galano-grotesque-medium.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/galano-grotesque-regular.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
