const { spawn } = require("child_process")
const path = require("path")

const root = path.resolve(__dirname, "..")
const backendDir = path.join(root, "backend")
const isWindows = process.platform === "win32"
const gradleCommand = path.join(backendDir, isWindows ? "gradlew.bat" : "gradlew")
const args = process.argv.slice(2)
const command = isWindows ? "cmd.exe" : gradleCommand
const commandArgs = isWindows ? ["/d", "/s", "/c", gradleCommand, ...args] : args

if (args.length === 0) {
    console.error("Usage: node ./scripts/run-gradle.js <gradle-task> [...args]")
    process.exit(1)
}

const child = spawn(command, commandArgs, {
    cwd: backendDir,
    env: {
        ...process.env,
        GRADLE_USER_HOME: path.join(backendDir, ".gradle"),
    },
    stdio: "inherit",
    shell: false,
})

child.on("error", (error) => {
    console.error(`Failed to start Gradle wrapper: ${error.message}`)
    process.exit(1)
})

child.on("exit", (code) => {
    process.exit(code ?? 1)
})
