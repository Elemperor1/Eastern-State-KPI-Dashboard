import type { Config } from "tailwindcss";

/**
 * Eastern State KPI — Tailwind theme.
 *
 * Color story: a navy → teal → bright-yellow palette, organized as three
 * families (ink, brand, accent) so Tailwind utilities like `bg-brand-500`
 * and `text-ink-700` continue to work after the rebrand.
 *
 * - `ink`  : the page chrome and the sidebar/header dark canvas.
 *            Anchored on `#003649` (the brand "tertiary" navy).
 * - `brand`: the teal story. `brand-500` is `#209ba5` (primary), and the
 *            700/800/900 steps step up into the secondary dark teal
 *            `#005f6f`. Used for buttons, chips, focus rings, the
 *            gradient endpoints, and chart strokes.
 * - `accent`: the Sample-data signal. `accent-500` is `#f7f242`; the
 *             application does not use this family for generic warnings,
 *             charts, selection, or decoration.
 *
 * The chart palette and CSS variables in `globals.css` carry the same
 * three hexes through every other surface (gradients, recharts, design
 * system shadows). Keep this file, globals.css, and DESIGN.md in sync.
 */
const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          // Light page chrome steps (50–300) are kept near-neutral so the
          // dashboard backgrounds stay calm. 400–950 step up through the
          // navy and the deep sidebar tone.
          50:  "#f5f7f8",
          100: "#e7eef0",
          200: "#cfe0e3",
          300: "#a9c2c8",
          400: "#7a9aa3",
          500: "#557883",
          600: "#3a5e69",
          700: "#234954",
          800: "#113e4a",
          900: "#003649", // tertiary — the deep navy
          950: "#002130",
        },
        brand: {
          // Teal family. brand-500 is the primary (#209ba5); brand-700
          // is the secondary dark teal (#005f6f); brand-900 sits below
          // the navy to act as a near-black for high-emphasis fills.
          50:  "#eaf7f8",
          100: "#cfedf0",
          200: "#9cd9de",
          300: "#5fbfc7",
          400: "#36adb6",
          500: "#209ba5", // primary — medium teal
          600: "#0e818b",
          700: "#005f6f", // secondary — dark teal
          800: "#014a57",
          900: "#003649", // tertiary — dark navy (mirrors ink-900)
          950: "#001f29",
        },
        accent: {
          // Yellow family. The bright #f7f242 sits at accent-500; the
          // surrounding steps support the single Sample-data treatment.
          50:  "#fdfbe7",
          100: "#fbf6c2",
          200: "#f8ee88",
          300: "#f7e961",
          400: "#f7f24f",
          500: "#f7f242", // accent — bright yellow
          600: "#d9d62b",
          700: "#a8a51b",
          800: "#6e6c10",
        },
      },
      fontFamily: {
        // Galano Grotesque is the project's licensed brand font (© René
        // Bieder, 2014). The @font-face declarations in globals.css
        // expose four weights (300/400/500/700) under a single family
        // name; the system fallback chain (-apple-system etc.) is the
        // same on both `sans` and `display` so a missed weight never
        // produces a different visual fallback on a hero headline.
        sans: ["Galano Grotesque", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Galano Grotesque", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Monaco", "Menlo", "Ubuntu Mono", "monospace"],
      },
      boxShadow: {
        // Shadows are tinted with the navy so the floating cards feel
        // rooted in the brand instead of an off-the-shelf Tailwind
        // greyscale. The previous violet tints (#1f1633, #150f23) are
        // swapped for the new navy ink.
        card: "0 0 0 1px rgba(0,54,73,0.07), 0 1px 2px -1px rgba(0,54,73,0.08), 0 4px 14px rgba(0,54,73,0.035)",
        soft: "0 0 0 1px rgba(0,54,73,0.08), 0 2px 6px rgba(0,54,73,0.05)",
        floating: "0 0.5rem 1.5rem rgba(0,33,48,0.18)",
      },
      backgroundImage: {
        // Brand gradient — tertiary → secondary → primary (navy → dark
        // teal → medium teal). This is the canonical brand gradient and
        // is also exposed as `bg-brand-gradient` so feature pages can
        // drop it onto a hero without reaching for a hex literal.
        "brand-gradient":
          "linear-gradient(to right, #003649, #005f6f, #209ba5)",
      },
    },
  },
  plugins: [],
};

export default config;
