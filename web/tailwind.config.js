/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cad-bg': '#1e1e2e',
        'cad-surface': '#2a2a3e',
        'cad-border': '#3a3a4e',
        'cad-accent': '#7c3aed',
        'cad-text': '#e4e4ef',
        'cad-muted': '#888899',
      }
    },
  },
  plugins: [],
}
