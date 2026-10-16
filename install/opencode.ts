#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { $ } from "bun"

const REPO_CONFIG_DIR = join(homedir(), ".dotfiles/config/opencode")
const OPENCODE_CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")
const PLUGINS_DIR = "plugins"

// OpenCode V1 created these in the config directory; they stay in the backup.
const LEGACY_ENTRIES = new Set([".gitignore", "package.json", "package-lock.json", "bun.lock", "node_modules"])

const conflicts: string[] = []
const localEntries: string[] = []

function hasSameContent(a: string, b: string) {
  return readFileSync(a).equals(readFileSync(b))
}

function inspect(relativePath: string) {
  const localPath = join(OPENCODE_CONFIG_DIR, relativePath)
  const repoPath = join(REPO_CONFIG_DIR, relativePath)
  const local = lstatSync(localPath)
  const repo = lstatSync(repoPath, { throwIfNoEntry: false })

  if (local.isSymbolicLink()) {
    if (readlinkSync(localPath) !== repoPath) conflicts.push(`${localPath} -> ${readlinkSync(localPath)} (expected ${repoPath})`)
    return
  }
  if (!repo) {
    localEntries.push(relativePath)
    return
  }
  if (local.isDirectory() && repo.isDirectory()) {
    inspectDirectory(relativePath)
    return
  }
  if (local.isFile() && repo.isFile() && hasSameContent(localPath, repoPath)) return
  conflicts.push(`${localPath} differs from ${repoPath}`)
}

function inspectDirectory(relativePath: string) {
  for (const name of readdirSync(join(OPENCODE_CONFIG_DIR, relativePath))) {
    if (relativePath === "" && LEGACY_ENTRIES.has(name)) continue
    inspect(join(relativePath, name))
  }
}

function replaceDirectoryWithLink() {
  inspectDirectory("")
  if (conflicts.length > 0) return

  for (const relativePath of localEntries) {
    renameSync(join(OPENCODE_CONFIG_DIR, relativePath), join(REPO_CONFIG_DIR, relativePath))
    console.log(`moved     ${relativePath} -> ${REPO_CONFIG_DIR}`)
  }
  const backup = `${OPENCODE_CONFIG_DIR}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
  renameSync(OPENCODE_CONFIG_DIR, backup)
  console.log(`backup    ${backup}`)
  symlinkSync(REPO_CONFIG_DIR, OPENCODE_CONFIG_DIR)
  console.log(`linked    ${OPENCODE_CONFIG_DIR}`)
}

function linkConfigDirectory() {
  const stat = lstatSync(OPENCODE_CONFIG_DIR, { throwIfNoEntry: false })

  if (!stat) {
    mkdirSync(dirname(OPENCODE_CONFIG_DIR), { recursive: true })
    symlinkSync(REPO_CONFIG_DIR, OPENCODE_CONFIG_DIR)
    console.log(`linked    ${OPENCODE_CONFIG_DIR}`)
    return
  }
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(OPENCODE_CONFIG_DIR)
    if (target === REPO_CONFIG_DIR) console.log(`ok        ${OPENCODE_CONFIG_DIR}`)
    else conflicts.push(`${OPENCODE_CONFIG_DIR} -> ${target} (expected ${REPO_CONFIG_DIR})`)
    return
  }
  if (stat.isDirectory()) {
    replaceDirectoryWithLink()
    return
  }
  conflicts.push(`${OPENCODE_CONFIG_DIR} exists and is not a directory or symlink`)
}

async function installPluginDependencies() {
  for (const name of readdirSync(join(REPO_CONFIG_DIR, PLUGINS_DIR))) {
    const pluginDir = join(REPO_CONFIG_DIR, PLUGINS_DIR, name)
    if (existsSync(join(pluginDir, "package.json"))) {
      await $`bun install --frozen-lockfile`.cwd(pluginDir)
    }
  }
}

linkConfigDirectory()

if (conflicts.length > 0) {
  console.error(`\n${conflicts.length} conflict(s):\n`)
  conflicts.forEach((conflict) => console.error(`${conflict}\n`))
  process.exit(1)
}

await installPluginDependencies()
