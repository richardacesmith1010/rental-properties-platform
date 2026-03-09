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
          from: "#7c3aed",
          to: "#064e3b",
        },
        domus: {
          primary: "#7C3AED",
          "primary-light": "#A78BFA",
          secondary: "#10B981",
          accent: "#F59E0B",
          danger: "#F43F5E",
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
