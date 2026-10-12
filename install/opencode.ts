#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

const REPO_CONFIG_DIR = join(homedir(), ".dotfiles/config/opencode")
const OPENCODE_CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")

const CONFIG_FILES = ["AGENTS.md", "opencode.json", "cli.json", "tui.json"]
const COMMANDS_DIR = "commands"
const PLUGINS_DIR = "plugins"

const conflicts: string[] = []

function hasSameContent(a: string, b: string) {
  return lstatSync(b).isFile() && readFileSync(a).equals(readFileSync(b))
}

function link(target: string, linkPath: string) {
  const stat = lstatSync(linkPath, { throwIfNoEntry: false })

  if (!stat) {
    symlinkSync(target, linkPath)
    console.log(`linked    ${linkPath}`)
    return
  }

  if (stat.isSymbolicLink()) {
    if (readlinkSync(linkPath) === target) {
      console.log(`ok        ${linkPath}`)
      return
    }
    conflicts.push(`${linkPath} -> ${readlinkSync(linkPath)} (expected ${target})`)
    console.log(`conflict  ${linkPath}`)
    return
  }

  if (stat.isFile() && hasSameContent(linkPath, target)) {
    unlinkSync(linkPath)
    symlinkSync(target, linkPath)
    console.log(`relinked  ${linkPath}`)
    return
  }

  if (stat.isFile() && lstatSync(target).isFile()) {
    const diff = spawnSync("diff", ["-u", target, linkPath], { encoding: "utf8" }).stdout
    conflicts.push(`${linkPath} differs from ${target}\n${diff}`)
  } else {
    conflicts.push(`${linkPath} exists and is not a symlink to ${target}`)
  }
  console.log(`conflict  ${linkPath}`)
}

function linkFromRepo(relativePath: string) {
  link(join(REPO_CONFIG_DIR, relativePath), join(OPENCODE_CONFIG_DIR, relativePath))
}

function listRepoEntries(dir: string) {
  return readdirSync(join(REPO_CONFIG_DIR, dir)).map((name) => join(dir, name))
}

function linkConfigFiles() {
  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true })
  CONFIG_FILES.forEach(linkFromRepo)
}

function linkCommands() {
  mkdirSync(join(OPENCODE_CONFIG_DIR, COMMANDS_DIR), { recursive: true })
  listRepoEntries(COMMANDS_DIR)
    .filter((path) => path.endsWith(".md"))
    .forEach(linkFromRepo)
}

function linkPlugins() {
  mkdirSync(join(OPENCODE_CONFIG_DIR, PLUGINS_DIR), { recursive: true })
  listRepoEntries(PLUGINS_DIR).forEach(linkFromRepo)
}

async function installPluginDependencies() {
  for (const plugin of listRepoEntries(PLUGINS_DIR)) {
    const pluginDir = join(REPO_CONFIG_DIR, plugin)
    if (existsSync(join(pluginDir, "package.json"))) {
      await $`bun install --frozen-lockfile`.cwd(pluginDir)
    }
  }
}

linkConfigFiles()
linkCommands()
linkPlugins()

if (conflicts.length > 0) {
  console.error(`\n${conflicts.length} conflict(s):\n`)
  conflicts.forEach((conflict) => console.error(`${conflict}\n`))
  process.exit(1)
}

await installPluginDependencies()
