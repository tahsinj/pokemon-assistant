/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Theme colors read the CSS variables in styles.css, so a biome change
      // recolors Tailwind classes too.
      colors: {
        ink: { 0: 'var(--ink-0)', 1: 'var(--ink-1)', 2: 'var(--ink-2)' },
        accent: { DEFAULT: 'var(--hud-accent)', 2: 'var(--hud-accent-2)' },
        danger: 'var(--hud-danger)',
        hairline: 'var(--hairline)',
      },
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
