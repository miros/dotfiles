import { Plugin } from "@opencode/plugin/tui"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"

const run = promisify(execFile)
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
const REFRESH_INTERVAL_MS = 5_000

export type GitStats = { additions: number; deletions: number }
export type ReadGitStats = (directory: string) => Promise<GitStats | undefined>

async function git(directory: string, args: string[]) {
  const { stdout } = await run("git", args, { cwd: directory, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

function countLines(content: Buffer) {
  if (content.length === 0) return 0
  let lines = 0
  for (const byte of content) if (byte === 10) lines++
  return content[content.length - 1] === 10 ? lines : lines + 1
}

async function countUntrackedAdditions(root: string) {
  const output = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
  const files = output.split("\0").filter(Boolean)
  let additions = 0
  for (const file of files) {
    try {
      const content = await readFile(join(root, file))
      if (content.includes(0)) continue
      additions += countLines(content)
    } catch {}
  }
  return additions
}

export const readGitStats: ReadGitStats = async directory => {
  let root: string
  try {
    root = (await git(directory, ["rev-parse", "--show-toplevel"])).trim()
  } catch {
    return undefined
  }
  const base = await git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).then(() => "HEAD", () => EMPTY_TREE)
  const [numstat, untrackedAdditions] = await Promise.all([
    git(root, ["diff", "--numstat", base]),
    countUntrackedAdditions(root),
  ])
  let additions = untrackedAdditions
  let deletions = 0
  for (const line of numstat.split("\n")) {
    const [added, deleted] = line.split("\t")
    if (!added || added === "-" || deleted === "-") continue
    additions += Number(added)
    deletions += Number(deleted)
  }
  return { additions, deletions }
}

function GitStatsLabel(props: {
  context: Plugin.Context
  readStats: ReadGitStats
  sessionID?: string
}) {
  const [stats, setStats] = createSignal<GitStats | undefined>()

  createEffect(() => {
    const sessionID = props.sessionID
    const directory = sessionID ? props.context.data.session.get(sessionID)?.location?.directory : undefined
    setStats(undefined)
    if (!sessionID || !directory) return

    let active = true
    let request = 0
    const refresh = async () => {
      const currentRequest = ++request
      let next: GitStats | undefined
      try {
        next = await props.readStats(directory)
      } catch {
        next = undefined
      }
      if (active && request === currentRequest) setStats(next)
    }

    const unsubscribe = props.context.data.on("session.tool.success", event => {
      if (event.data.sessionID === sessionID) void refresh()
    })
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    onCleanup(() => {
      active = false
      unsubscribe()
      clearInterval(interval)
    })
    void refresh()
  })

  const label = () => {
    const current = stats()
    if (!current || (current.additions === 0 && current.deletions === 0)) return undefined
    return `+${current.additions},-${current.deletions}`
  }

  return (
    <Show when={label()}>
      <text fg={props.context.theme.text.muted} selectable={false}>{label()}</text>
    </Show>
  )
}

export function createGitStatsPlugin(readStats: ReadGitStats) {
  return Plugin.define({
    id: "local.git-stats.tui",
    setup(context) {
      return context.ui.slot({
        append: "prompt.footer.status",
        render: input => <GitStatsLabel context={context} readStats={readStats} sessionID={input.sessionID} />,
      })
    },
  })
}

export default createGitStatsPlugin(readGitStats)
