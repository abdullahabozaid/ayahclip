import { expect, test } from "@playwright/test";

const productionOrigin = "https://ayahclip.vercel.app";

test("Googlebot can discover the public product through robots and sitemap", async ({ request }) => {
  const robotsResponse = await request.get("/robots.txt", {
    headers: { "User-Agent": "Googlebot" },
  });
  expect(robotsResponse.status()).toBe(200);
  expect(robotsResponse.headers()["content-type"]).toContain("text/plain");
  const robots = await robotsResponse.text();
  expect(robots).toContain("User-Agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain(`Sitemap: ${productionOrigin}/sitemap.xml`);

  const sitemapResponse = await request.get("/sitemap.xml", {
    headers: { "User-Agent": "Googlebot" },
  });
  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()["content-type"]).toContain("application/xml");
  const sitemap = await sitemapResponse.text();
  for (const path of ["", "/browse", "/import", "/styles", "/support", "/privacy", "/terms"]) {
    expect(sitemap).toContain(`<loc>${productionOrigin}${path}</loc>`);
  }
  for (const privatePath of ["/api/", "/diagnostics", "/library", "/studio", "/styles/editor"]) {
    expect(sitemap).not.toContain(`<loc>${productionOrigin}${privatePath}</loc>`);
  }
});

test("indexable pages publish distinct titles, descriptions, and canonical URLs", async ({ page }) => {
  const pages = [
    { path: "/", title: /AyahClip/, canonical: "/" },
    { path: "/browse", title: /Browse the Quran/, canonical: "/browse" },
    { path: "/import", title: /Import a recitation/, canonical: "/import" },
    { path: "/styles", title: /Templates/, canonical: "/styles" },
    { path: "/privacy", title: /Privacy/, canonical: "/privacy" },
    { path: "/terms", title: /Terms/, canonical: "/terms" },
  ];

  for (const entry of pages) {
    await page.goto(entry.path);
    await expect(page).toHaveTitle(entry.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^.{50,}$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      entry.canonical === "/" ? productionOrigin : `${productionOrigin}${entry.canonical}`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
});

test("private editor and browser-storage pages explicitly opt out of indexing", async ({ page }) => {
  for (const path of ["/library", "/studio", "/styles/editor", "/diagnostics", "/support/thanks", "/surah/1"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${productionOrigin}${path}`,
    );
  }
});

test("the browser manifest describes an installable AyahClip surface", async ({ request, page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    short_name: "AyahClip",
    start_url: "/",
    display: "standalone",
    background_color: "#08090d",
    theme_color: "#08090d",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ src: "/favicon.ico", type: "image/x-icon" })]),
  );
});
