import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
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
  mkdirSync(config, { recursive: true })
  for (const name of ["AGENTS.md", "opencode.json", "cli.json", "tui.json", "commands/example.md", "plugins/example/index.ts"]) {
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

test("links repository entries inside real config directories", () => {
  const result = install()
  expect(result.exitCode).toBe(0)
  for (const dir of ["commands", "plugins"]) {
    expect(lstatSync(join(config, dir)).isDirectory()).toBe(true)
  }
  for (const name of ["AGENTS.md", "commands/example.md", "plugins/example"]) {
    expect(readlinkSync(join(config, name))).toBe(join(repo, name))
  }
})

test("keeps correct symlinks on repeated installation", () => {
  expect(install().exitCode).toBe(0)
  expect(install().exitCode).toBe(0)
  expect(readlinkSync(join(config, "plugins/example"))).toBe(join(repo, "plugins/example"))
})

test.each(["file", "directory", "symlink"])("fails without changing a conflicting %s", (type) => {
  const destination = join(config, "AGENTS.md")
  if (type === "file") writeFileSync(destination, "local")
  if (type === "directory") mkdirSync(destination)
  if (type === "symlink") symlinkSync(join(home, "missing"), destination)

  const result = install()
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain(`Destination already exists: ${destination}`)
  expect(existsSync(`${destination}.bak`)).toBe(false)
  if (type === "file") expect(readFileSync(destination, "utf8")).toBe("local")
  if (type === "directory") expect(lstatSync(destination).isDirectory()).toBe(true)
  if (type === "symlink") expect(readlinkSync(destination)).toBe(join(home, "missing"))
})

test.each(["commands", "plugins"])("fails without changing repository entries through an existing %s directory symlink", (dir) => {
  symlinkSync(join(repo, dir), join(config, dir))
  const original = dir === "commands" ? "commands/example.md" : "plugins/example/index.ts"

  expect(install().exitCode).not.toBe(0)
  expect(readFileSync(join(repo, original), "utf8")).toBe("original")
  expect(readdirSync(join(repo, dir)).some(name => name.endsWith(".bak"))).toBe(false)
})
