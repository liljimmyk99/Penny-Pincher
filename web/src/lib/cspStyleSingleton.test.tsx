import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { styleSingleton } from "./cspStyleSingleton";

/** jsdom has no constructed stylesheets; this records what would be adopted. */
class FakeSheet {
  css = "";
  replaceSync(css: string) {
    this.css = css;
  }
}

const adopted = () => (document as unknown as { adoptedStyleSheets: FakeSheet[] }).adoptedStyleSheets;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
  Object.defineProperty(document, "adoptedStyleSheets", { value: [], writable: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
});

test("adds the CSS as one constructed stylesheet, never a <style> element, while any instance is mounted", () => {
  const Style = styleSingleton();
  const first = render(<Style styles="body { overflow: hidden; }" />);
  const second = render(<Style styles="body { overflow: hidden; }" />);

  expect(adopted()).toHaveLength(1);
  expect(adopted()[0].css).toBe("body { overflow: hidden; }");
  expect(document.querySelectorAll("style")).toHaveLength(0);

  first.unmount();
  expect(adopted()).toHaveLength(1);
  second.unmount();
  expect(adopted()).toHaveLength(0);
});

test("leaves stylesheets other code adopted in place", () => {
  const theirs = new FakeSheet();
  adopted().push(theirs);
  const Style = styleSingleton();
  const { unmount } = render(<Style styles="body { overflow: hidden; }" />);
  expect(adopted()).toHaveLength(2);
  unmount();
  expect(adopted()).toEqual([theirs]);
});

test("does nothing where constructed stylesheets aren't supported", () => {
  delete (document as unknown as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  const Style = styleSingleton();
  const { unmount } = render(<Style styles="body { overflow: hidden; }" />);
  expect(document.querySelectorAll("style")).toHaveLength(0);
  unmount();
});
