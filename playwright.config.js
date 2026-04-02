const { defineConfig } = require("@playwright/test")

module.exports = defineConfig({
    testDir: "./e2e/tests",
    fullyParallel: false,
    workers: 1,
    timeout: 120000,
    expect: {
        timeout: 15000,
    },
    reporter: [["list"]],
    use: {
        headless: true,
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "msedge",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "retain-on-failure",
    },
})
