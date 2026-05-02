/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['VT323', 'ui-monospace', 'Menlo', 'monospace'],
        pixel: ['"Press Start 2P"', 'system-ui', 'monospace'],
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
