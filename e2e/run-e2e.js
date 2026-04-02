const { spawn } = require("child_process")
const http = require("http")
const net = require("net")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const IS_WINDOWS = process.platform === "win32"
const TASKKILL_COMMAND = IS_WINDOWS ? "taskkill" : null
const POWERSHELL_COMMAND = IS_WINDOWS
    ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    : "powershell"
const PLAYWRIGHT_CLI = require.resolve("@playwright/test/cli")
const REACT_SCRIPTS_CLI = path.join(ROOT, "frontend", "node_modules", "react-scripts", "bin", "react-scripts.js")
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_BROWSER_CHANNEL || "msedge"
const CHECKPOINT_INTERVAL_MS = process.env.E2E_CHECKPOINT_INTERVAL_MS || "1500"
const SAVE_INTERVAL_MS = process.env.E2E_SAVE_INTERVAL_MS || "500"
const DOCKER_E2E_PROJECT_NAME = "collab-editor-e2e"

function log(message) {
    console.log(`[e2e] ${message}`)
}

function spawnProcess(command, args, options = {}) {
    const { name, ...spawnOptions } = options
    const child = spawn(command, args, {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        ...spawnOptions,
    })

    const processName = name || command

    child.stdout?.on("data", (chunk) => {
        process.stdout.write(`[${processName}] ${chunk}`)
    })

    child.stderr?.on("data", (chunk) => {
        process.stderr.write(`[${processName}] ${chunk}`)
    })

    return child
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: ROOT,
            shell: false,
            ...options,
        })

        let stdout = ""
        let stderr = ""

        child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString()
        })

        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString()
        })

        child.on("error", reject)
        child.on("exit", (code) => {
            if (code === 0) {
                resolve({
                    stdout,
                    stderr,
                })
                return
            }

            reject(new Error(`${command} ${args.join(" ")} failed with code ${code}\n${stderr || stdout}`))
        })
    })
}

function waitForTcp(port, host = "127.0.0.1", timeoutMs = 60000) {
    const startedAt = Date.now()

    return new Promise((resolve, reject) => {
        const attempt = () => {
            const socket = net.createConnection({ port, host })

            socket.once("connect", () => {
                socket.end()
                resolve()
            })

            socket.once("error", () => {
                socket.destroy()

                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error(`Timed out waiting for TCP ${host}:${port}`))
                    return
                }

                setTimeout(attempt, 500)
            })
        }

        attempt()
    })
}

function waitForHttp(url, timeoutMs = 120000) {
    const startedAt = Date.now()

    return new Promise((resolve, reject) => {
        const attempt = () => {
            const request = http.get(url, (response) => {
                response.resume()

                if (response.statusCode && response.statusCode < 500) {
                    resolve()
                    return
                }

                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error(`Timed out waiting for ${url}`))
                    return
                }

                setTimeout(attempt, 500)
            })

            request.on("error", () => {
                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error(`Timed out waiting for ${url}`))
                    return
                }

                setTimeout(attempt, 500)
            })
        }

        attempt()
    })
}

async function stopProcess(child) {
    if (!child || child.exitCode != null) return

    if (IS_WINDOWS) {
        await runCommand(TASKKILL_COMMAND, ["/pid", String(child.pid), "/T", "/F"]).catch(() => {})
        return
    }

    child.kill("SIGTERM")
}

async function ensureMongo() {
    log("Starting MongoDB if needed")
    await runCommand(POWERSHELL_COMMAND, [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(ROOT, "scripts", "start-local-mongo.ps1"),
    ])
}

async function stopMongo() {
    log("Stopping repo-managed MongoDB if it was started for E2E")
    await runCommand(POWERSHELL_COMMAND, [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(ROOT, "scripts", "stop-local-mongo.ps1"),
    ]).catch(() => {})
}

async function ensureRedis() {
    log("Ensuring Redis container is available")

    const inspectResult = await runCommand("docker", [
        "ps",
        "-a",
        "--filter",
        "name=^/collab-redis$",
        "--format",
        "{{.Names}} {{.Status}}",
    ]).catch((error) => {
        throw new Error(
            `Redis E2E requires Docker Desktop with the engine running.\n${error.message}`
        )
    })

    const containerStatus = inspectResult.stdout.trim()
    const wasRunning = containerStatus.includes("Up")

    if (!containerStatus) {
        log("Creating Redis container collab-redis")
        await runCommand("docker", ["run", "--name", "collab-redis", "-p", "6379:6379", "-d", "redis:7"])
    } else if (!wasRunning) {
        log("Starting existing Redis container collab-redis")
        await runCommand("docker", ["start", "collab-redis"])
    }

    await waitForTcp(6379)

    return {
        async cleanup() {
            if (wasRunning) return

            log("Stopping Redis container collab-redis")
            await runCommand("docker", ["stop", "collab-redis"]).catch(() => {})
        },
    }
}

async function startDockerStack() {
    log("Starting Docker Compose stack for full-stack E2E")

    const composeEnvironment = {
        ...process.env,
        CHECKPOINT_INTERVAL_MS,
        CLIENT_ORIGIN: "http://localhost:3000,http://127.0.0.1:3000",
        COMPOSE_PROJECT_NAME: DOCKER_E2E_PROJECT_NAME,
        MONGODB_DB_NAME: "collab-editor-e2e-docker",
        REACT_APP_SAVE_INTERVAL_MS: SAVE_INTERVAL_MS,
    }

    await runCommand("docker", ["compose", "-p", DOCKER_E2E_PROJECT_NAME, "up", "-d", "--build"], {
        env: composeEnvironment,
    }).catch((error) => {
        throw new Error(
            `Docker-backed E2E requires Docker Desktop with the engine running.\n${error.message}`
        )
    })

    await waitForTcp(3001)
    await waitForHttp("http://127.0.0.1:3001/healthz")
    await waitForHttp("http://127.0.0.1:3000")

    return {
        async cleanup() {
            log("Stopping Docker Compose stack")

            await runCommand("docker", [
                "compose",
                "-p",
                DOCKER_E2E_PROJECT_NAME,
                "down",
                "-v",
                "--remove-orphans",
            ]).catch(() => {})
        },
    }
}

async function startBackend({ name, port, mongoDbName, redisUrl, clientOrigins }) {
    const env = {
        ...process.env,
        SOCKET_PORT: String(port),
        MONGODB_URI: `mongodb://127.0.0.1:27017/${mongoDbName}`,
        CHECKPOINT_INTERVAL_MS,
        CLIENT_ORIGIN: clientOrigins,
    }

    if (redisUrl) {
        env.REDIS_URL = redisUrl
    } else {
        delete env.REDIS_URL
    }

    const child = spawnProcess(
        process.execPath,
        ["server.js"],
        {
            cwd: path.join(ROOT, "backend"),
            env,
            name,
        }
    )

    await waitForTcp(port)
    return child
}

async function startFrontend({ name, port, socketUrl }) {
    const env = {
        ...process.env,
        BROWSER: "none",
        HOST: "127.0.0.1",
        PORT: String(port),
        REACT_APP_SOCKET_URL: socketUrl,
        REACT_APP_SAVE_INTERVAL_MS: SAVE_INTERVAL_MS,
    }

    const child = spawnProcess(
        process.execPath,
        [REACT_SCRIPTS_CLI, "start"],
        {
            cwd: path.join(ROOT, "frontend"),
            env,
            name,
        }
    )

    await waitForHttp(`http://127.0.0.1:${port}`)
    return child
}

async function runPlaywright(specName) {
    log(`Running Playwright spec ${specName} with channel ${PLAYWRIGHT_CHANNEL}`)

    await runCommand(process.execPath, [
        PLAYWRIGHT_CLI,
        "test",
        "--config",
        path.join(ROOT, "playwright.config.js"),
        specName.replace(/\\/g, "/"),
    ], {
        cwd: ROOT,
        env: {
            ...process.env,
            PLAYWRIGHT_BROWSER_CHANNEL: PLAYWRIGHT_CHANNEL,
        },
    })
}

async function runSingleNodeSuite() {
    const processes = []

    try {
        await ensureMongo()
        processes.push(await startBackend({
            name: "backend-3001",
            port: 3001,
            mongoDbName: "collab-editor-e2e-single",
            clientOrigins: "http://127.0.0.1:3000",
        }))
        processes.push(await startFrontend({
            name: "frontend-3000",
            port: 3000,
            socketUrl: "http://127.0.0.1:3001",
        }))

        await runPlaywright(path.join("e2e", "tests", "single-node.spec.js"))
    } finally {
        while (processes.length > 0) {
            await stopProcess(processes.pop())
        }

        await stopMongo()
    }
}

async function runRedisSuite() {
    const processes = []
    let redisHandle = null

    try {
        await ensureMongo()
        redisHandle = await ensureRedis()
        processes.push(await startBackend({
            name: "backend-3001",
            port: 3001,
            mongoDbName: "collab-editor-e2e-redis",
            redisUrl: "redis://127.0.0.1:6379",
            clientOrigins: "http://127.0.0.1:3000,http://127.0.0.1:3003",
        }))
        processes.push(await startBackend({
            name: "backend-3002",
            port: 3002,
            mongoDbName: "collab-editor-e2e-redis",
            redisUrl: "redis://127.0.0.1:6379",
            clientOrigins: "http://127.0.0.1:3000,http://127.0.0.1:3003",
        }))
        processes.push(await startFrontend({
            name: "frontend-3000",
            port: 3000,
            socketUrl: "http://127.0.0.1:3001",
        }))
        processes.push(await startFrontend({
            name: "frontend-3003",
            port: 3003,
            socketUrl: "http://127.0.0.1:3002",
        }))

        await runPlaywright(path.join("e2e", "tests", "redis.spec.js"))
    } finally {
        while (processes.length > 0) {
            await stopProcess(processes.pop())
        }

        await redisHandle?.cleanup()
        await stopMongo()
    }
}

async function runDockerSuite() {
    let dockerStack = null

    try {
        dockerStack = await startDockerStack()
        await runPlaywright(path.join("e2e", "tests", "single-node.spec.js"))
    } finally {
        await dockerStack?.cleanup()
    }
}

async function main() {
    const mode = process.argv[2] || "all"

    if (mode === "single") {
        await runSingleNodeSuite()
        return
    }

    if (mode === "redis") {
        await runRedisSuite()
        return
    }

    if (mode === "all") {
        await runSingleNodeSuite()
        await runRedisSuite()
        await runDockerSuite()
        return
    }

    if (mode === "docker") {
        await runDockerSuite()
        return
    }

    throw new Error(`Unknown E2E mode "${mode}"`)
}

main().catch((error) => {
    console.error(`[e2e] ${error.message}`)
    process.exit(1)
})
