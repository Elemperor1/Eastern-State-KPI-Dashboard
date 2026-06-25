import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f6f8",
          100: "#f0eef3",
          200: "#e5e1e9",
          300: "#cfc8d6",
          400: "#9f96aa",
          500: "#796f84",
          600: "#5b5067",
          700: "#3f344c",
          800: "#2b2039",
          900: "#1f1633",
          950: "#150f23",
        },
        brand: {
          50: "#f3f0fb",
          100: "#e7e2f5",
          200: "#cec5ea",
          300: "#b2a5dd",
          400: "#9382ca",
          500: "#6a5fc1",
          600: "#5548a9",
          700: "#422082",
          800: "#2d174f",
          900: "#1f1633",
          950: "#150f23",
        },
        accent: {
          50: "#f8fde9",
          100: "#effbc9",
          200: "#def698",
          300: "#c2ef4e",
          400: "#a8d736",
          500: "#8aaa25",
          600: "#667f1d",
          700: "#4a5d19",
          800: "#344214",
        },
      },
      fontFamily: {
        sans: ["Rubik Variable", "Rubik", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Rubik Variable", "Rubik", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Monaco", "Menlo", "Ubuntu Mono", "monospace"],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(31,22,51,0.07), 0 1px 2px -1px rgba(31,22,51,0.08), 0 4px 14px rgba(31,22,51,0.035)",
        soft: "0 0 0 1px rgba(31,22,51,0.08), 0 2px 6px rgba(31,22,51,0.05)",
        floating: "0 0.5rem 1.5rem rgba(21,15,35,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
