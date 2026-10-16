import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const installer = join(import.meta.dir, "../install/opencode.ts")
let home: string
let repo: string
let config: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "opencode-install-test-"))
  repo = join(home, ".dotfiles/config/opencode")
  config = join(home, ".config/opencode")
  mkdirSync(join(repo, "commands"), { recursive: true })
  mkdirSync(join(repo, "plugins/example"), { recursive: true })
  for (const name of ["AGENTS.md", "cli.json", "commands/example.md", "plugins/example/index.ts"]) {
    writeFileSync(join(repo, name), "original")
  }
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function install() {
  return Bun.spawnSync([process.execPath, installer], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
  })
}

function createConfigDirectoryWithFileLinks() {
  mkdirSync(join(config, "commands"), { recursive: true })
  mkdirSync(join(config, "plugins"), { recursive: true })
  for (const name of ["AGENTS.md", "cli.json", "commands/example.md", "plugins/example"]) {
    symlinkSync(join(repo, name), join(config, name))
  }
}

function backups() {
  return readdirSync(join(home, ".config")).filter(name => name.startsWith("opencode.backup-"))
}

test("links the config directory to the repository", () => {
  expect(install().exitCode).toBe(0)
  expect(readlinkSync(config)).toBe(repo)
})

test("keeps the directory symlink on repeated installation", () => {
  expect(install().exitCode).toBe(0)
  const result = install()
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain(`ok        ${config}`)
  expect(readlinkSync(config)).toBe(repo)
})

test("moves local-only files into the repository", () => {
  createConfigDirectoryWithFileLinks()
  writeFileSync(join(config, "service.json"), "secret")
  writeFileSync(join(config, "commands/local.md"), "local")

  expect(install().exitCode).toBe(0)
  expect(readlinkSync(config)).toBe(repo)
  expect(readFileSync(join(repo, "service.json"), "utf8")).toBe("secret")
  expect(readFileSync(join(repo, "commands/local.md"), "utf8")).toBe("local")
})

test("keeps service.json permissions after moving", () => {
  createConfigDirectoryWithFileLinks()
  writeFileSync(join(config, "service.json"), "secret", { mode: 0o600 })

  expect(install().exitCode).toBe(0)
  expect(statSync(join(repo, "service.json")).mode & 0o777).toBe(0o600)
})

test("leaves legacy dependency files in the backup only", () => {
  createConfigDirectoryWithFileLinks()
  for (const name of [".gitignore", "package.json", "package-lock.json", "bun.lock"]) writeFileSync(join(config, name), "legacy")
  mkdirSync(join(config, "node_modules"))

  expect(install().exitCode).toBe(0)
  const [backup] = backups()
  for (const name of [".gitignore", "package.json", "package-lock.json", "bun.lock", "node_modules"]) {
    expect(existsSync(join(repo, name))).toBe(false)
    expect(existsSync(join(home, ".config", backup, name))).toBe(true)
  }
})

test("backs up the old config directory before linking", () => {
  createConfigDirectoryWithFileLinks()

  expect(install().exitCode).toBe(0)
  const [backup] = backups()
  expect(readlinkSync(join(home, ".config", backup, "AGENTS.md"))).toBe(join(repo, "AGENTS.md"))
})

test("fails without changes when a local file differs from the repository file", () => {
  createConfigDirectoryWithFileLinks()
  rmSync(join(config, "cli.json"))
  writeFileSync(join(config, "cli.json"), "local")
  writeFileSync(join(config, "service.json"), "secret")

  const result = install()
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain(`${join(config, "cli.json")} differs from ${join(repo, "cli.json")}`)
  expect(lstatSync(config).isDirectory()).toBe(true)
  expect(readFileSync(join(config, "cli.json"), "utf8")).toBe("local")
  expect(readFileSync(join(repo, "cli.json"), "utf8")).toBe("original")
  expect(existsSync(join(config, "service.json"))).toBe(true)
  expect(existsSync(join(repo, "service.json"))).toBe(false)
  expect(backups()).toEqual([])
})

test("fails without changes when the config path links to another location", () => {
  mkdirSync(join(home, ".config"))
  symlinkSync(join(home, "elsewhere"), config)

  const result = install()
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain(`${config} -> ${join(home, "elsewhere")} (expected ${repo})`)
  expect(readlinkSync(config)).toBe(join(home, "elsewhere"))
})
