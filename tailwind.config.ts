import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        theme: {
          DEFAULT: "var(--theme)",
          hover: "var(--theme-hover)",
        },
        error: "var(--error)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      backgroundColor: {
        primary: "var(--background-primary)",
        secondary: "var(--background-secondary)",
        skeleton: "var(--background-skeleton)",
        card: "var(--background-card)",
      },
      textColor: {
        primary: "var(--font-primary)",
        secondary: "var(--font-secondary)",
        background: "var(--font-background)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
