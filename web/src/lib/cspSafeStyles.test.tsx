/**
 * #168 · The shadcn/ui dependencies never add a <style> element, which the CSP
 * blocks; the CSS they need is adopted as constructed stylesheets instead
 * (plugins/cspSafeStyles.ts, src/lib/cspAdoptedStyles.ts, src/lib/cspStyleSingleton.ts).
 */
import { act, render, screen } from "@testing-library/react";
import { Command } from "cmdk";
import { AlertDialog, Dialog, DropdownMenu, Popover, ScrollArea, Select, Tooltip } from "radix-ui";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

/** jsdom has no constructed stylesheets; this records what would be adopted. */
class FakeSheet {
  css = "";
  replaceSync(css: string) {
    this.css = css;
  }
}

const adoptedCss = () =>
  (document as unknown as { adoptedStyleSheets: FakeSheet[] }).adoptedStyleSheets.map((s) => s.css).join("\n");

/** Every <style> element added to the document, even one removed again before the test looks. */
let added: string[] = [];
function record(records: MutationRecord[]) {
  for (const r of records)
    for (const node of r.addedNodes)
      if (node instanceof Element && (node.tagName === "STYLE" || node.querySelector("style"))) added.push(node.outerHTML);
}
const observer = new MutationObserver(record);

beforeAll(() => {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
  Object.defineProperty(document, "adoptedStyleSheets", { value: [], writable: true, configurable: true });
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
});

beforeEach(() => {
  added = [];
  observer.observe(document, { childList: true, subtree: true });
});

afterEach(() => observer.disconnect());

function expectNoStyleElements() {
  record(observer.takeRecords());
  expect(added, "<style> elements added").toEqual([]);
  expect(document.querySelectorAll("style")).toHaveLength(0);
}

const overlays: [string, () => ReactElement, string][] = [
  [
    "Dialog",
    () => (
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Edit expense</Dialog.Title>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    ),
    "overflow: hidden", // the scroll lock
  ],
  [
    "AlertDialog",
    () => (
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Overlay />
          <AlertDialog.Content aria-describedby={undefined}>
            <AlertDialog.Title>Delete this expense?</AlertDialog.Title>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    ),
    "overflow: hidden",
  ],
  [
    "DropdownMenu",
    () => (
      <DropdownMenu.Root open>
        <DropdownMenu.Trigger>Account</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>Sign out</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    ),
    "overflow: hidden",
  ],
  [
    "Select",
    () => (
      <Select.Root open defaultValue="food">
        <Select.Trigger aria-label="Category">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper">
            <Select.Viewport>
              <Select.Item value="food">
                <Select.ItemText>Food</Select.ItemText>
              </Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    ),
    "[data-radix-select-viewport]",
  ],
  [
    "ScrollArea",
    () => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>Rows</ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical">
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    ),
    "[data-radix-scroll-area-viewport]",
  ],
  [
    "Popover with a cmdk combobox",
    () => (
      <Popover.Root open>
        <Popover.Trigger>Merchant</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>
            <Command label="Merchants">
              <Command.Input />
              <Command.List>
                <Command.Item>Corner Shop</Command.Item>
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    ),
    "",
  ],
  [
    "cmdk Command.Dialog",
    () => (
      <Command.Dialog open label="Search">
        <Command.Input />
        <Command.List>
          <Command.Item>Corner Shop</Command.Item>
        </Command.List>
      </Command.Dialog>
    ),
    "overflow: hidden",
  ],
  [
    "Tooltip",
    () => (
      <Tooltip.Provider>
        <Tooltip.Root open>
          <Tooltip.Trigger>Locked</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content>Other can't be deleted</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    ),
    "",
  ],
];

test.each(overlays)("%s adds no <style> element; its CSS is adopted while open", (_, ui, css) => {
  const { unmount } = render(ui());
  expectNoStyleElements();
  if (css) expect(adoptedCss()).toContain(css);
  unmount();
  if (css) expect(adoptedCss()).not.toContain(css);
  expectNoStyleElements();
});

test("Sonner adds its stylesheet as a constructed stylesheet, not a <style> element", async () => {
  // Imported here, after the stubs, because Sonner adds its CSS as soon as it loads.
  const { Toaster, toast } = await import("sonner");
  expect(adoptedCss()).toContain("[data-sonner-toaster]");

  render(<Toaster />);
  act(() => {
    toast("Refund linked");
  });
  expect(await screen.findByText("Refund linked")).toBeInTheDocument();
  expectNoStyleElements();
});
