/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC",
        navy: "#0F2942",
        teal: "#0D9488",
        amber: "#D97706",
        crimson: "#DC2626",
        ink: "#0F172A",
        slate2: "#475569",
        muted: "#94A3B8",
        hairline: "#E2E8F0",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", "'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 41, 66, 0.06)",
      },
      borderRadius: {
        card: "6px",
        input: "4px",
      },
    },
  },
  plugins: [],
};
