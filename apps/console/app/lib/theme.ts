/**
 * Same key the storefront uses. The two apps run on different origins today,
 * so nothing is actually shared — but they will not always, and a single key
 * means a preference set on one is honoured by the other the day they sit
 * behind one domain.
 */
export const THEME_STORAGE_KEY = 'event-forge:theme';

export type Theme = 'light' | 'dark';

/**
 * Runs before first paint, inlined in <head>.
 *
 * Without it the page renders in the default theme and then corrects itself
 * once React hydrates — a white flash on every navigation for anyone using
 * dark mode. It has to be a string because it must execute before the bundle
 * loads, and it must not throw: localStorage is unavailable in some privacy
 * modes, and a throw here would block rendering entirely.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme =
      stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;
