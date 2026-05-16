import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1e3a5f",
        accent: "#f59e0b"
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "20px"
      },
      boxShadow: {
        card: "0 6px 20px rgba(15, 23, 42, 0.08)",
        float: "0 10px 28px rgba(15, 23, 42, 0.1)",
        dock: "0 -8px 32px rgba(15, 23, 42, 0.12)"
      },
      spacing: {
        "nav-mobile": "4.25rem",
        "header": "3.25rem"
      },
      maxWidth: {
        content: "72rem"
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: [
    function ({ addVariant }) {
      addVariant("theme-dark", ".theme-dark &");
      addVariant("fine-hover", "@media (hover: hover) and (pointer: fine)");
      addVariant("touch-only", "@media (hover: none) and (pointer: coarse)");
    },
    tailwindcssAnimate
  ]
};
