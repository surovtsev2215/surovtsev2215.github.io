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
        xl: "12px"
      },
      boxShadow: {
        card: "0 6px 20px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: [
    function ({ addVariant }) {
      addVariant("theme-dark", ".theme-dark &");
    },
    tailwindcssAnimate
  ]
};
