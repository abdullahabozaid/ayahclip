import { expect, test } from "@playwright/test";

test("support page does not offer a checkout that the server cannot start", async ({ page }) => {
  await page.goto("/support");

  await expect(page.getByRole("heading", { name: "Checkout is not open yet" })).toBeVisible();
  await expect(page.getByText("Secure support checkout will appear here once it is enabled.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Support with|Support .* month/ })).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Donation frequency" })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Something did not work?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open diagnostics" }))
    .toHaveAttribute("href", "/diagnostics");
  await expect(page.getByRole("link", { name: "Request help" }))
    .toHaveAttribute(
      "href",
      "https://github.com/abdullahabozaid/ayahclip/issues/new?template=support.yml",
    );
  await expect(page.getByText(/Never attach private recordings/)).toBeVisible();
});
