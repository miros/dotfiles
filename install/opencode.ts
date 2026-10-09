#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

const REPO_CONFIG_DIR = join(homedir(), ".dotfiles/config/opencode")
const OPENCODE_CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")

const CONFIG_FILES = ["AGENTS.md", "opencode.json", "cli.json", "tui.json"]
const COMMANDS_DIR = "commands"
const PLUGINS_DIR = "plugins"

function link(target: string, linkPath: string) {
  const stat = lstatSync(linkPath, { throwIfNoEntry: false })

  if (stat?.isSymbolicLink() && readlinkSync(linkPath) === target) {
    console.log(`ok        ${linkPath}`)
    return
  }

  if (stat) {
    throw new Error(`Destination already exists: ${linkPath}`)
  }

  symlinkSync(target, linkPath)
  console.log(`linked    ${linkPath}`)
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
await installPluginDependencies()
