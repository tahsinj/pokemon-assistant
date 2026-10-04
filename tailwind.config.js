/**
 * A theme color backed by a CSS variable. Opacity modifiers (`border-danger/40`)
 * mix it with transparent, since Tailwind cannot split a variable into channels.
 */
function token(name) {
  return ({ opacityValue }) =>
    opacityValue === undefined || opacityValue === '1' || opacityValue.startsWith('var(')
      ? `var(${name})`
      : `color-mix(in oklab, var(${name}) calc(${opacityValue} * 100%), transparent)`;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Theme colors read the CSS variables in styles.css, so a biome change
      // recolors Tailwind classes too.
      colors: {
        ink: { 0: token('--ink-0'), 1: token('--ink-1'), 2: token('--ink-2') },
        accent: { DEFAULT: token('--hud-accent'), 2: token('--hud-accent-2') },
        danger: token('--hud-danger'),
        hairline: token('--hairline'),
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
