// LiveKit's brand has a dark mode (the default here) and a light mode. The
// choice is kept in this browser.

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'lab.theme';

/**
 * Runs in <head> before the page paints, so a visitor who chose light never
 * sees a flash of dark. Pre-rendered into every exported page.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies to this page.
  }
}
