import { expect, type Page } from "@playwright/test";

/** Test-only crew. These values exist only in tests (SPEC §16 item 3). */
export interface TestAstronaut {
  name: string;
  crewCode: string;
  role: "astronaut" | "commander" | "surgeon" | "admin";
  pin: string;
}

export async function acceptConsentIfShown(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "I understand" });
  if (await button.isVisible().catch(() => false)) await button.click();
}

export async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "Unlock" }).click();
}

/** Registers through the real form, then unlocks with the PIN pad. */
export async function registerAndUnlock(
  page: Page,
  astronaut: TestAstronaut,
): Promise<void> {
  await acceptConsentIfShown(page);
  const first = page.getByRole("button", { name: "Register astronaut" });
  const another = page.getByRole("button", {
    name: "+ Register another astronaut",
  });
  if (await another.isVisible().catch(() => false)) await another.click();
  else await first.click();

  await page.getByLabel("Full name").fill(astronaut.name);
  await page.getByLabel("Crew ID").fill(astronaut.crewCode);
  await page.getByLabel("Role").selectOption(astronaut.role);
  await page.getByLabel("PIN (4-6 digits)").fill(astronaut.pin);
  await page.getByLabel("Confirm PIN").fill(astronaut.pin);
  await page
    .getByRole("button", { name: "Register astronaut", exact: true })
    .click();

  await expect(page.getByText("Enter your PIN")).toBeVisible();
  await enterPin(page, astronaut.pin);
  await expectUnlocked(page, astronaut);
}

export async function expectUnlocked(
  page: Page,
  astronaut: TestAstronaut,
): Promise<void> {
  await expect(
    page.getByText(`${astronaut.name} · ${astronaut.crewCode}`).first(),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
}

/** Client-side navigation through the bottom bar. A full page load would
 * lock the app (the unlocked astronaut is kept in memory only). */
export async function navTo(
  page: Page,
  tab: "Home" | "Check-in" | "Body" | "Trends" | "More",
): Promise<void> {
  await page
    .getByRole("navigation")
    .getByRole("link", { name: new RegExp(`^${tab}`) })
    .click();
}

export async function openFromMore(page: Page, title: string): Promise<void> {
  await navTo(page, "More");
  await page.getByRole("link", { name: new RegExp(title) }).click();
}

/** A minimal real check-in typed through the wizard: no symptoms, one
 * heart-rate value, mood "Good". */
export async function completeCheckin(
  page: Page,
  heartRate: string,
): Promise<void> {
  await navTo(page, "Check-in");
  await expect(page.getByText("Step 1 of")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "None today" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByRole("textbox", { name: "Resting heart rate", exact: true })
    .fill(heartRate);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Save check-in" }).click();
  // The result screen always shows the rules version it was evaluated
  // with ("Rule <id>" lines only appear for non-green results).
  await expect(page.getByText(/Rules version \d/).first()).toBeVisible();
}
