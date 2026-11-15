import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEARN_TOPICS } from "@/config/learn";
import { APP_ROUTES } from "@/lib/pwa/appRoutes";

const APP_DIR = path.join(__dirname, "..", "..", "app", "(app)");

/** Static routes found on disk: every folder under app/(app) that has a
 * page.tsx, skipping dynamic `[param]` folders. */
function pagesOnDisk(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  if (existsSync(path.join(dir, "page.tsx"))) found.push(prefix || "/");
  for (const name of readdirSync(dir)) {
    const child = path.join(dir, name);
    if (!statSync(child).isDirectory() || name.startsWith("[")) continue;
    found.push(...pagesOnDisk(child, `${prefix}/${name}`));
  }
  return found;
}

describe("APP_ROUTES (screens made available offline)", () => {
  it("lists every static page under app/(app)", () => {
    for (const route of pagesOnDisk(APP_DIR)) {
      expect(APP_ROUTES, route).toContain(route);
    }
  });

  it("lists every Learn topic page", () => {
    for (const topic of LEARN_TOPICS) {
      expect(APP_ROUTES).toContain(`/learn/${topic.slug}`);
    }
  });

  it("has no duplicates and only app paths", () => {
    expect(new Set(APP_ROUTES).size).toBe(APP_ROUTES.length);
    for (const route of APP_ROUTES) expect(route).toMatch(/^\/[a-z0-9/-]*$/);
  });
});
