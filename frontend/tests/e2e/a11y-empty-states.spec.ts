import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptConsentIfShown,
  navTo,
  openFromMore,
  registerAndUnlock,
  type TestAstronaut,
} from "./helpers";

// C16: empty-state audit (SPEC §16 table) and accessibility pass (SPEC §14:
// axe, keyboard, reduced motion) on a fresh install. Every browser context
// starts with empty IndexedDB, so this is a real "fresh install".

const COMMANDER: TestAstronaut = {
  name: "Empty State Tester",
  crewCode: "E2E-EMP-1",
  role: "commander",
  pin: "5917",
};

/** WCAG 2.1 A/AA rules. The WebGL canvas is excluded: axe cannot inspect
 * pixels, and the 3D body's accessible alternative is the RegionList,
 * which IS checked. */
async function expectNoAxeViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("canvas")
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(", ")}`,
  );
  expect(summary, `axe violations on ${screen}`).toEqual([]);
}

test.describe("fresh install: empty states + axe", () => {
  test("every screen shows its empty state and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/");

    // Consent (onboarding disclaimer).
    await expect(
      page.getByRole("heading", { name: "Before you start" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "Consent");
    await acceptConsentIfShown(page);

    // Crew: "No astronauts registered yet" + Register button.
    await expect(page.getByText("No astronauts registered yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Register astronaut" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "Crew (empty)");

    await registerAndUnlock(page, COMMANDER);
    const who = `${COMMANDER.name} · ${COMMANDER.crewCode}`;

    // Home: "No check-in yet for <Name · ID>" + Start check-in.
    await expect(page.getByText(`No check-in yet for ${who}`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start check-in" }),
    ).toBeVisible();
    await expect(page.getByText("No data yet").first()).toBeVisible();
    await expectNoAxeViolations(page, "Home (empty)");

    // Check-in step 1: nothing fake in "yesterday".
    await navTo(page, "Check-in");
    await expect(page.getByText("No previous check-in yet.")).toBeVisible();
    await expectNoAxeViolations(page, "Check-in (recap)");

    // Trends: "Charts appear after your first check-in."
    await navTo(page, "Trends");
    await expect(
      page.getByText("Charts appear after your first check-in."),
    ).toBeVisible();
    await expectNoAxeViolations(page, "Trends (empty)");

    // Body: grey regions + "No data yet" in the panel and region list.
    await navTo(page, "Body");
    await expect(
      page.getByText(
        "No data yet. Complete a check-in to see this region's status.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, "Body (empty)");

    // Rewards: 0 points, 0 streak, locked badges.
    await openFromMore(page, "Rewards");
    await expect(page.getByText(/^0 points · 0-day streak · 0 of \d+ badges unlocked$/)).toBeVisible();
    await expectNoAxeViolations(page, "Rewards (empty)");

    // Crew overview: rows say "No check-in yet" instead of a status.
    await openFromMore(page, "Crew overview");
    await expect(
      page.getByRole("heading", { name: "Crew overview" }),
    ).toBeVisible();
    await expect(page.getByText("No check-in yet").first()).toBeVisible();
    await expectNoAxeViolations(page, "Crew overview (empty)");

    // Sync: "Nothing to sync" (a fresh device has queued only its own
    // registration, which counts as a change, so check the wording rule
    // via the status row rather than assume zero).
    await openFromMore(page, "Sync and data");
    await expect(
      page.getByRole("heading", { name: "Sync and data" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^(Nothing to sync|\d+ changes?)$/),
    ).toBeVisible();
    await expectNoAxeViolations(page, "Sync");

    // Reminders, Learn, Environment, More.
    await openFromMore(page, "Reminders");
    await expectNoAxeViolations(page, "Reminders");
    await openFromMore(page, "Learn");
    await expectNoAxeViolations(page, "Learn");
    await openFromMore(page, "Environment");
    await expectNoAxeViolations(page, "Environment");
    await navTo(page, "More");
    await expectNoAxeViolations(page, "More");
  });
});

test.describe("keyboard", () => {
  test("register and unlock with the keyboard only", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "I understand" }).focus();
    await page.keyboard.press("Enter");

    // Tab until the Register button has focus, then activate it.
    const register = page.getByRole("button", { name: "Register astronaut" });
    for (let i = 0; i < 25; i += 1) {
      if (await register.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(register).toBeFocused();
    await page.keyboard.press("Enter");

    await page.getByLabel("Full name").focus();
    await page.keyboard.type("Keyboard Tester");
    await page.keyboard.press("Tab");
    await page.keyboard.type("E2E-KEY-1");
    await page.getByLabel("PIN (4-6 digits)").focus();
    await page.keyboard.type("3141");
    await page.keyboard.press("Tab");
    await page.keyboard.type("3141");
    await page.keyboard.press("Enter"); // submits the form

    await expect(page.getByText("Enter your PIN")).toBeVisible();
    for (const digit of "3141") {
      await page.getByRole("button", { name: digit, exact: true }).focus();
      await page.keyboard.press("Enter");
    }
    await page.getByRole("button", { name: "Unlock" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Keyboard Tester · E2E-KEY-1").first()).toBeVisible();

    // The 3D body's region list is reachable and operable by keyboard.
    await navTo(page, "Body");
    const regionButtons = page
      .getByRole("list")
      .getByRole("button", { name: /Heart/ });
    await regionButtons.first().focus();
    await expect(regionButtons.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(
        "No data yet. Complete a check-in to see this region's status.",
      ),
    ).toBeVisible();
  });

  test("every interactive element on the crew screen has a visible focus target of at least 44px", async ({
    page,
  }) => {
    await page.goto("/");
    await acceptConsentIfShown(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], input, select")]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? "").trim() || el.id, h: r.height };
        })
        .filter((e) => e.h < 44),
    );
    expect(small).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no DOM animation keeps running when the user prefers reduced motion", async ({
    page,
  }) => {
    await page.goto("/");
    await acceptConsentIfShown(page);
    await registerAndUnlock(page, { ...COMMANDER, crewCode: "E2E-RM-1" });
    for (const tab of ["Home", "Body", "Trends"] as const) {
      await navTo(page, tab);
      await page.waitForTimeout(1500);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target;
            return target instanceof Element
              ? `${target.tagName}.${target.className}`
              : "unknown";
          }),
      );
      expect(running, `running animations on ${tab}`).toEqual([]);
    }
  });
});
