import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT } from "./theme.ts";

/** Runs the inline script with a stored choice, or none. */
function runScript(stored: string | null) {
  if (stored === null) localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, stored);
  new Function(THEME_SCRIPT)();
}

describe("THEME_KEY", () => {
  it("stores the theme under labstrail-theme, the key the script reads", () => {
    expect(THEME_KEY).toBe("labstrail-theme");
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_KEY));
  });
});

describe("THEME_SCRIPT", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("sets the stored theme on <html> before React runs", () => {
    runScript("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets light when nothing is stored", () => {
    document.documentElement.dataset.theme = "dark";
    runScript(null);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("sets light for a stored value that names no theme", () => {
    runScript("sepia");

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
