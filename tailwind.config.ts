import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "cool-grey": "#F4F6F8",
        "pure-white": "#FFFFFF",
        "slate-text": "#1A202C",
        muted: "#5A6A85",
        "grid-line": "#E2E8F0",
        "clinical-blue": {
          DEFAULT: "#0052CC",
          hover: "#0043A4",
          active: "#00317A",
        },
        "status-accepted": {
          text: "#0F5132",
          bg: "#D1E7DD",
          border: "#BADACC",
        },
        "status-draft": {
          text: "#664D03",
          bg: "#FFF3CD",
          border: "#FFECB5",
        },
        "status-rejected": {
          text: "#842029",
          bg: "#F8D7DA",
          border: "#F5C2C7",
        },
      },
      borderRadius: {
        sm: "2px",
        md: "6px",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
    },
  },
  plugins: [],
};

export default config;