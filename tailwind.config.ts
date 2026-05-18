import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16171A",
        paper: "#F7F7F2",
        line: "#E3E1D8",
        moss: "#3F6B4E",
        mint: "#7AB893",
        coral: "#F26D5B",
        lemon: "#F3C84C",
        sky: "#63A8D8",
        plum: "#8D5A7B"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(20, 22, 24, 0.10)",
        panel: "0 10px 28px rgba(20, 22, 24, 0.08)"
      },
      fontFamily: {
        sans: [
          "Inter",
          "Noto Sans SC",
          "Noto Sans JP",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
} satisfies Config;
