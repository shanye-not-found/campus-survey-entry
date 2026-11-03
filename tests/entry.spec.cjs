const { test, expect } = require("@playwright/test");
const makeRecord = (state = "started", ip = "10.31.94.172") => ({ schema_version: 1, state, updated_at: new Date().toISOString(), addresses: state === "started" ? [{ label: "WLAN", url: `http://${ip}:5173` }] : [] });
const apiPattern = "https://api.github.com/repos/shanye-not-found/campus-survey-entry/contents/address.json?**";

test("读取最新地址、复制、刷新到新 IP，并报告停止", async ({ page, context }) => {
  let record = makeRecord();
  const requests = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(apiPattern, async (route) => { requests.push(route.request().url()); await route.fulfill({ json: record }); });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "进入审阅" })).toHaveAttribute("href", "http://10.31.94.172:5173/review");
  await expect(page.locator("#updated")).toContainText("北京时间");
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.locator("#feedback")).toHaveText("链接已复制。");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://10.31.94.172:5173/review");
  record = makeRecord("started", "192.168.1.50");
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.getByRole("link", { name: "进入审阅" })).toHaveAttribute("href", "http://192.168.1.50:5173/review");
  expect(requests[0]).not.toBe(requests[1]);
  record = makeRecord("stopped");
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.locator("#status")).toContainText("服务已停止");
  await expect(page.getByRole("link", { name: "进入审阅" })).toHaveCount(0);
});

test("失败可重试，拒绝非法地址，手机没有横向溢出", async ({ page }) => {
  let kind = "failed";
  await page.route(apiPattern, async (route) => {
    if (kind === "failed") return route.fulfill({ status: 503, body: "unavailable" });
    if (kind === "bad") return route.fulfill({ json: { ...makeRecord(), addresses: [{ label: "WLAN", url: "javascript:alert(1)" }] } });
    return route.fulfill({ json: makeRecord() });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("503");
  kind = "bad";
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.locator("#status")).toContainText("不受支持的地址");
  await expect(page.getByRole("link", { name: "进入审阅" })).toHaveCount(0);
  kind = "good";
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.getByRole("link", { name: "进入审阅" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/entry-mobile.png", fullPage: true });
});

test("超时、限流和无网卡均提供可恢复说明", async ({ page }) => {
  await page.clock.install();
  await page.route(apiPattern, () => new Promise(() => {}));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.clock.fastForward(13000);
  await expect(page.locator("#status")).toContainText("读取超时");
  await expect(page.getByRole("button", { name: "刷新地址" })).toBeEnabled();
  await page.unroute(apiPattern);
  await page.route(apiPattern, (route) => route.fulfill({ status: 403, body: "rate limited" }));
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.locator("#status")).toContainText("限制了请求");
  await page.unroute(apiPattern);
  await page.route(apiPattern, (route) => route.fulfill({ json: makeRecord("unavailable") }));
  await page.getByRole("button", { name: "刷新地址" }).click();
  await expect(page.locator("#status")).toContainText("未找到可用的局域网地址");
});
