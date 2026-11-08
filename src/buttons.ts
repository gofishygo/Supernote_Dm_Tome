/** Stable button ids. Never renumber these once a build has shipped. */
export const BUTTONS = {
  /** Toolbar button: opens the DM console. */
  CONSOLE: 100,
  /** Lasso button: recognize circled handwriting and file it. */
  CAPTURE: 200,
} as const;

export type ButtonId = (typeof BUTTONS)[keyof typeof BUTTONS];
