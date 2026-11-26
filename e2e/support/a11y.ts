/** Accessibility checks shared by the specs (#179). */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** WCAG 2.0, 2.1 and 2.2, levels A and AA: every axe rule with one of these tags. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

export interface AxeOptions {
  /** Only check inside these selectors. */
  include?: string[];
  /** Rules to skip, each with the reason written where it is used. */
  disable?: string[];
}

/** Axe violations on the page (or only inside `include`), one line per element. */
export async function axeViolations(page: Page, { include = [], disable = [] }: AxeOptions = {}): Promise<string[]> {
  let axe = new AxeBuilder({ page }).withTags(WCAG_TAGS).disableRules(disable);
  for (const selector of include) axe = axe.include(selector);
  const results = await axe.analyze();
  return results.violations.flatMap((v) =>
    v.nodes.map((n) => `[${v.id}] ${n.target.join(" ")}: ${n.failureSummary?.replace(/\s+/g, " ")}`),
  );
}

/**
 * Waits for running enter animations (tw-animate-css fades and zooms) to finish, so axe
 * doesn't measure contrast on a half-faded menu or dialog. Endless ones (spinners) are skipped.
 */
export async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/**
 * The page passes every WCAG A/AA axe rule. A full-page screenshot is attached to the
 * report, so whether it *looks* right can still be checked by a person.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo, label: string, options: AxeOptions = {}) {
  await page.waitForLoadState("networkidle");
  await settleAnimations(page);
  await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(await axeViolations(page, options), `axe (WCAG A/AA) on ${label}`).toEqual([]);
}

/** The page is in the dark theme, with a dark background. */
export async function expectDark(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = background.match(/\d+/g)!.map(Number);
  expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `body background ${background} should be dark`).toBeLessThan(60);
}

/** The page is dark and passes every WCAG A/AA axe rule. */
export async function expectDarkAndAccessible(page: Page, testInfo: TestInfo, label: string, options: AxeOptions = {}) {
  await expectDark(page);
  await expectAccessible(page, testInfo, `dark ${label}`, options);
}
