import type { Config } from "tailwindcss";
import { SUNSET, UI } from "./src/lib/theme";

// Sunset theme, built from the logo colours. Roles:
// - coral (also available as `brand`): everything you can click — buttons, links, focus rings, the cart badge
// - sun: deals and discounts (yellow tags, as European discount stores use them)
// - plum: the logo purple, for small accents (rank badges) and the games corner
// - ink: warm charcoal neutrals; its lightest step is the cream page background
// Green, red and amber stay for status (success, error, warning).
const coral = {
  50: "#FFF3EF",
  100: "#FFE4DB",
  200: "#FFC8B7",
  300: "#FBA58B",
  400: SUNSET.coral,
  500: "#E5603C",
  600: UI.action,
  700: "#A53A24",
  800: "#842F20",
  900: "#6B281C",
  950: "#3B140D",
};

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: coral,
        coral,
        sun: {
          50: "#FFFBF0",
          100: "#FFF3D3",
          200: "#FFE6A6",
          300: "#FFD77E",
          400: SUNSET.yellow,
          500: "#F5AE2A",
          600: "#D88C12",
          700: "#B06A0E",
          800: "#8C5212",
          900: "#734413",
        },
        plum: {
          50: "#FBF1F6",
          100: "#F5E1EC",
          200: "#EBC3D9",
          300: "#DA98BE",
          400: "#C26C9F",
          500: "#A24A86",
          600: SUNSET.purple,
          700: "#6A2258",
          800: "#561C48",
          900: "#43163A",
          950: "#2A0C24",
        },
        ink: {
          50: SUNSET.cream,
          100: "#F6EFE9",
          200: "#E9E0D9",
          300: "#D4C9C2",
          400: "#A69B95",
          500: "#786E6A",
          600: "#5C5350",
          700: "#463E3D",
          800: "#322B2C",
          900: UI.ink,
          950: "#161213",
        },
        cream: SUNSET.cream,
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        logo: ["var(--font-logo)", "Arial Rounded MT Bold", "ui-rounded", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
