import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        brand: {
          50: "#f3f5fb",
          100: "#e5ebf6",
          200: "#c9d4ea",
          300: "#a0b3d7",
          400: "#7188be",
          500: "#4d66a6",
          600: "#3b4f89",
          700: "#31416f",
          800: "#2a375b",
          900: "#1c2440",
          950: "#131a2e",
        },
        accent: {
          50: "#fdf6e7",
          100: "#faecc8",
          200: "#f4d690",
          300: "#edbb56",
          400: "#e7a332",
          500: "#cf841f",
          600: "#a9651a",
          700: "#7e4b16",
          800: "#553115",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)",
        soft: "0 1px 2px rgba(15,23,42,0.06), 0 2px 6px rgba(15,23,42,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
