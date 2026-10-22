/** The site's two themes. Light is the default; dark applies once the visitor picks it. */
export type Theme = "light" | "dark";

/** Where the visitor's choice is kept, in this browser's `localStorage`. */
export const THEME_KEY = "labstrail-theme";

/**
 * Runs in `<head>`, before the first paint: sets `<html data-theme>` to the visitor's stored
 * choice when it is "dark", and to light otherwise, a blocked storage included (a private
 * window, say).
 */
export const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}document.documentElement.dataset.theme=t==="dark"?"dark":"light"})()`;
