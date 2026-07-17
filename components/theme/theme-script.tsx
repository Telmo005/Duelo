/** Runs before first paint (plain inline script, not a React effect) so a
 *  visitor who already chose light mode never sees a dark flash while
 *  hydration catches up. Reads the same localStorage key theme-toggle.tsx
 *  writes to. Absent/invalid value = dark, matching the app's default
 *  before light mode existed at all — nobody's saved preference silently
 *  changes just because this shipped. */
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("duelo-theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
