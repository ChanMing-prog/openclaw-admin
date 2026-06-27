/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--cl-brand)",
          light: "var(--cl-brand-light)",
          lighter: "var(--cl-brand-lighter)",
          lightest: "var(--cl-brand-lightest)",
          dark: "var(--cl-brand-dark)",
          darker: "var(--cl-brand-darker)",
          darkest: "var(--cl-brand-darkest)",
          bg: "var(--cl-brand-bg)",
        },
        surface: {
          DEFAULT: "var(--cl-surface)",
          secondary: "var(--cl-surface-secondary)",
          hover: "var(--cl-surface-hover)",
          active: "var(--cl-surface-active)",
        },
        bg: {
          primary: "var(--cl-bg-primary)",
          secondary: "var(--cl-bg-secondary)",
          tertiary: "var(--cl-bg-tertiary)",
          elevated: "var(--cl-bg-elevated)",
          sunken: "var(--cl-bg-sunken)",
        },
        "cl-text": {
          primary: "var(--cl-text-primary)",
          secondary: "var(--cl-text-secondary)",
          tertiary: "var(--cl-text-tertiary)",
          muted: "var(--cl-text-muted)",
          faint: "var(--cl-text-faint)",
          inverse: "var(--cl-text-inverse)",
        },
        "cl-border": {
          DEFAULT: "var(--cl-border-primary)",
          secondary: "var(--cl-border-secondary)",
          faint: "var(--cl-border-faint)",
        },
        status: {
          success: "var(--cl-status-success)",
          warning: "var(--cl-status-warning)",
          error: "var(--cl-status-error)",
          info: "var(--cl-status-info)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--cl-radius-sm)",
        md: "var(--cl-radius-md)",
        lg: "var(--cl-radius-lg)",
        xl: "var(--cl-radius-xl)",
        "2xl": "var(--cl-radius-2xl)",
        full: "var(--cl-radius-full)",
      },
      boxShadow: {
        xs: "var(--cl-shadow-xs)",
        sm: "var(--cl-shadow-sm)",
        md: "var(--cl-shadow-md)",
        lg: "var(--cl-shadow-lg)",
        xl: "var(--cl-shadow-xl)",
      },
      transitionTimingFunction: {
        "cl-out": "cubic-bezier(0.2, 0, 0, 1)",
        "cl-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "200ms",
        slow: "300ms",
      },
      animation: {
        "fade-in": "fadeIn 0.25s cubic-bezier(0.2, 0, 0, 1) both",
        "slide-up": "slideUp 0.3s cubic-bezier(0.2, 0, 0, 1) both",
        "slide-in-left": "slideInLeft 0.3s cubic-bezier(0.2, 0, 0, 1) both",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.2, 0, 0, 1) both",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
