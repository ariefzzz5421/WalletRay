import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { fontFamily: { sans: ["var(--font-geist-sans)", "Arial", "sans-serif"], mono: ["var(--font-geist-mono)", "monospace"] } } },
  plugins: [],
};
export default config;
