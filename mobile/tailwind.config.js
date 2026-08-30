/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Wohoo brand — mirrors the web app (cream + pink gradient).
        cream: "#FAFAF8",
        ink: "#111110",
        rose: {
          50: "#FFF1F7",
          100: "#FCE7F3",
          300: "#F9A8D4",
          400: "#F472B6",
          500: "#EC4899",
          600: "#DB2777",
        },
      },
      fontFamily: {
        serif: ["Cormorant", "Georgia", "serif"],
        sans: ["Jost", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
