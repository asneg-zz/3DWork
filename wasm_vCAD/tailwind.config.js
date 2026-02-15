/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cad-bg': '#1a1a1a',
        'cad-surface': '#2a2a2a',
        'cad-border': '#3a3a3a',
        'cad-hover': '#353535',
        'cad-text': '#e0e0e0',
        'cad-muted': '#a0a0a0',
        'cad-accent': '#4a9eff',
        'cad-success': '#4ade80',
        'cad-warning': '#fbbf24',
        'cad-error': '#f87171',
      }
    },
  },
  plugins: [],
}
