// The olozzo "Sunset" brand colours. The logo, the loader and the Tailwind theme (tailwind.config.ts) all
// start from these four values, so a brand change happens here.
export const SUNSET = {
  yellow: "#FFC857",
  coral: "#F47B58",
  purple: "#7D2A68",
  cream: "#FFF8F1",
} as const;

// Interface colours derived from the logo. The site itself is light and calm (cream and white with charcoal
// text); coral marks everything you can click, yellow marks deals, and purple stays in the logo and small accents.
export const UI = {
  /** Buttons and links: the logo coral, deepened so white text on it passes WCAG AA (4.8:1) */
  action: "#C8462A",
  /** Text and dark surfaces: a warm charcoal */
  ink: "#231D1F",
} as const;
