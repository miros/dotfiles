import { afterEach, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { createElement, insert, testRender, type JSX } from "@opentui/solid"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSignal } from "solid-js"
import { createGitStatsPlugin, readGitStats, type GitStats, type ReadGitStats } from "./tui"

type Slot = {
  append: string
  render(input: { sessionID?: string }): JSX.Element
}
type ToolSuccessHandler = (event: { data: { sessionID: string } }) => void

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function createRepo() {
  const directory = mkdtempSync(join(tmpdir(), "git-stats-"))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory })
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  git("config", "commit.gpgsign", "false")
  const write = (file: string, content: string | Buffer) => writeFileSync(join(directory, file), content)
  const commit = () => {
    git("add", "-A")
    git("commit", "-q", "-m", "commit")
  }
  return { directory, git, write, commit }
}

async function createHarness(options: {
  readStats?: ReadGitStats
  directories?: Record<string, string>
} = {}) {
  const [sessionID, setSessionID] = createSignal<string | undefined>("session-a")
  const directories = options.directories ?? { "session-a": "/repo-a", "session-b": "/repo-b" }
  const readStats = mock(options.readStats ?? (async () => ({ additions: 3, deletions: 1 })))
  const handlers = new Set<ToolSuccessHandler>()
  let slot: Slot | undefined
  const context = {
    data: {
      session: {
        get: (id: string) => directories[id] ? { location: { directory: directories[id] } } : undefined,
      },
      on: (type: string, handler: ToolSuccessHandler) => {
        if (type !== "session.tool.success") throw new Error(`Unexpected event ${type}`)
        handlers.add(handler)
        return () => { handlers.delete(handler) }
      },
    },
    theme: { text: { muted: "#888888" } },
    ui: {
      slot: (claim: Slot) => {
        slot = claim
        return () => {}
      },
    },
  } as unknown as Plugin.Context
  createGitStatsPlugin(readStats).setup(context)
  const input = { get sessionID() { return sessionID() } }
  const view = await testRender(() => {
    const footer = createElement("box")
    insert(footer, () => slot!.render(input))
    return footer
  }, { width: 40, height: 3 })
  cleanups.push(() => view.renderer.destroy())
  await view.flush()

  return {
    ...view,
    readStats,
    handlers,
    setSessionID,
    succeedTool(id = sessionID()!) {
      for (const handler of handlers) handler({ data: { sessionID: id } })
    },
  }
}

test("shows additions and deletions of uncommitted changes", async () => {
  const repo = createRepo()
  repo.write("a.txt", "one\ntwo\nthree\n")
  repo.commit()
  repo.write("a.txt", "one\nchanged\nthree\nfour\n")
  expect(await readGitStats(repo.directory)).toEqual({ additions: 2, deletions: 1 })
})

test("includes staged and unstaged changes", async () => {
  const repo = createRepo()
  repo.write("staged.txt", "a\n")
  repo.write("unstaged.txt", "a\n")
  repo.commit()
  repo.write("staged.txt", "a\nb\n")
  repo.git("add", "staged.txt")
  repo.write("unstaged.txt", "")
  expect(await readGitStats(repo.directory)).toEqual({ additions: 1, deletions: 1 })
})

test("counts lines of untracked files as additions", async () => {
  const repo = createRepo()
  repo.write("tracked.txt", "a\n")
  repo.commit()
  repo.write("new.txt", "one\ntwo\nthree")
  repo.write(".gitignore", "ignored.txt\n")
  repo.write("ignored.txt", "x\ny\n")
  expect(await readGitStats(repo.directory)).toEqual({ additions: 4, deletions: 0 })
})

test("counts changes in a repository without commits", async () => {
  const repo = createRepo()
  repo.write("staged.txt", "a\nb\n")
  repo.git("add", "staged.txt")
  repo.write("new.txt", "c\n")
  expect(await readGitStats(repo.directory)).toEqual({ additions: 3, deletions: 0 })
})

test("skips binary files", async () => {
  const repo = createRepo()
  repo.write("tracked.bin", Buffer.from([1, 0, 2]))
  repo.commit()
  repo.write("tracked.bin", Buffer.from([3, 0, 4, 10, 5]))
  repo.write("new.bin", Buffer.from([0, 10, 0, 10]))
  expect(await readGitStats(repo.directory)).toEqual({ additions: 0, deletions: 0 })
})

test("returns no stats outside a git repository", async () => {
  const directory = mkdtempSync(join(tmpdir(), "git-stats-"))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  expect(await readGitStats(directory)).toBeUndefined()
})

test("shows stats for the session directory", async () => {
  const view = await createHarness()
  expect(view.readStats).toHaveBeenCalledWith("/repo-a")
  expect(view.captureCharFrame()).toContain("+3,-1")
})

test("hides the label when there are no changes", async () => {
  const view = await createHarness({ readStats: async () => ({ additions: 0, deletions: 0 }) })
  expect(view.captureCharFrame()).not.toContain("+")
})

test("hides the label outside a git repository", async () => {
  const view = await createHarness({ readStats: async () => undefined })
  expect(view.captureCharFrame()).not.toContain("+")
})

test("hides the label when reading stats fails", async () => {
  const view = await createHarness({ readStats: async () => { throw new Error("git failed") } })
  expect(view.captureCharFrame()).not.toContain("+")
})

test("reloads stats when switching sessions", async () => {
  const view = await createHarness({
    readStats: async directory => directory === "/repo-a"
      ? { additions: 1, deletions: 0 }
      : { additions: 7, deletions: 2 },
  })
  expect(view.captureCharFrame()).toContain("+1,-0")
  view.setSessionID("session-b")
  await view.flush()
  expect(view.captureCharFrame()).toContain("+7,-2")
  expect(view.handlers.size).toBe(1)
})

test("refreshes stats after a tool call succeeds", async () => {
  let stats: GitStats = { additions: 1, deletions: 0 }
  const view = await createHarness({ readStats: async () => stats })
  stats = { additions: 5, deletions: 4 }
  view.succeedTool()
  await view.flush()
  expect(view.captureCharFrame()).toContain("+5,-4")
})

test("ignores tool calls from other sessions", async () => {
  const view = await createHarness()
  view.succeedTool("session-b")
  await view.flush()
  expect(view.readStats).toHaveBeenCalledTimes(1)
})

test("does not show a previous session's delayed result", async () => {
  const previous = Promise.withResolvers<GitStats>()
  const view = await createHarness({
    readStats: directory => directory === "/repo-a"
      ? previous.promise
      : Promise.resolve({ additions: 2, deletions: 0 }),
  })
  view.setSessionID("session-b")
  await view.flush()
  previous.resolve({ additions: 9, deletions: 9 })
  await view.flush()
  expect(view.captureCharFrame()).toContain("+2,-0")
})

test("does not load stats without a session", async () => {
  const view = await createHarness()
  view.setSessionID(undefined)
  await view.flush()
  expect(view.readStats).toHaveBeenCalledTimes(1)
  expect(view.captureCharFrame()).not.toContain("+")
  expect(view.handlers.size).toBe(0)
})
