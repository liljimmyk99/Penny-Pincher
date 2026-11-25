import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(async () => {
  cleanup();
  // Sonner keeps toasts in a module-wide store and replays them to the next Toaster.
  // Imported lazily: cspSafeStyles.test.tsx must stub the CSSOM before Sonner loads.
  (await import("sonner")).toast.dismiss();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.classList.remove("dark");
  window.history.replaceState(null, "", "/");
});

// jsdom has no matchMedia; default to a light system theme. Tests override as needed.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Browser APIs that Radix (and so shadcn/ui) components call but jsdom lacks.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
