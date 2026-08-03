/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        asphalt: "#1C2128",
        bone: "#F3EEE3",
        amber: {
          DEFAULT: "#E8A33D",
          dim: "#B87F2C",
        },
        route: "#FF5A1F",
        steel: "#5B6472",
        line: "#2A313B",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        "route-dash":
          "repeating-linear-gradient(90deg, #E8A33D 0 10px, transparent 10px 18px)",
      },
    },
  },
  plugins: [],
};
