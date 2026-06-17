import type { Config } from "tailwindcss";

// Dark-only. Colors map to --mxm-* design tokens (Design/musixmatch-pro-design-spec.md).
// No invented colors — every value resolves to a token (CLAUDE.md §4).
export default {
  darkMode: "class",
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "mxm-bg": "var(--mxm-backgroundPrimary)",
        "mxm-bg-elevated": "var(--mxm-backgroundPrimaryElevated)",
        "mxm-bg-secondary": "var(--mxm-backgroundSecondary)",
        "mxm-content": "var(--mxm-contentPrimary)",
        "mxm-content-secondary": "var(--mxm-contentSecondary)",
        "mxm-content-tertiary": "var(--mxm-contentTertiary)",
        "mxm-brand": "var(--mxm-paletteBrand100)",
        "mxm-red": "var(--mxm-systemRed100)",
        "mxm-green": "var(--mxm-systemGreen100)",
        "mxm-amber": "var(--mxm-systemAmber100)",
        "mxm-border": "var(--mxm-borderPrimary)",
      },
      borderRadius: {
        mxm: "var(--mxm-radius)",
      },
    },
  },
  plugins: [],
} satisfies Config;
