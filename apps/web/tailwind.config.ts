import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        sidebar: {
          from: "#1e1b4b",
          to: "#312e81",
        },
        accent: {
          indigo: "#6366f1",
          violet: "#8b5cf6",
        },
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
