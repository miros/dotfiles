import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import type { KeymapCommand } from "@opencode/plugin/tui/context"
import * as childProcess from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, relative } from "node:path"
import plugin from "./tui"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  mock.restore()
})

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "zed-test-"))
  const file = join(directory, "some file.ts")
  writeFileSync(file, "export const value = 1\n")
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  let route: { type: "session"; sessionID: string } | { type: "home" } = { type: "session", sessionID: "session-a" }
  let text: string | undefined
  let editing = false
  let pending: Array<{ key: string }> = []
  let command: KeymapCommand
  let running: Promise<void | false> = Promise.resolve()
  const editor = {}
  const keyInput = new EventEmitter()
  keyInput.on("keypress", (event) => {
    text = undefined
    if (event.name === "leader") {
      pending = [{ key: "leader" }]
      return
    }
    const opens = pending.length > 0 && event.name === "z"
    pending = []
    if (opens) running = Promise.resolve(command.run(undefined, event))
  })
  const child = Object.assign(new EventEmitter(), { unref: mock(() => {}) })
  const spawn = spyOn(childProcess, "spawn").mockReturnValue(child as unknown as childProcess.ChildProcess)
  const toast = mock(() => {})
  const context = {
    location: { directory: "/plugin-location" },
    renderer: {
      keyInput,
      get currentFocusedEditor() { return editing ? editor : null },
      getSelection: () => text === undefined ? null : {
        getSelectedText: () => text,
        selectedRenderables: editing ? [editor] : [],
      },
    },
    data: {
      session: { get: () => ({ location: { directory } }) },
      location: { default: () => ({ directory: "/default-location" }) },
    },
    keymap: {
      pending: () => pending,
      layer: (factory: () => { commands: KeymapCommand[] }) => { command = factory().commands[0] },
    },
    ui: { router: { current: () => route }, toast: { show: toast }, format: { path: (path: string) => path } },
  } as unknown as Plugin.Context
  const stop = plugin.setup(context) as () => void
  cleanups.push(stop)
  return {
    directory, file, spawn, toast, child, stop, keyInput,
    command: command!,
    select(value: string | undefined) { text = value },
    edit(value: string) { editing = true; text = value },
    setRoute(value: typeof route) { route = value },
    async press(name: string) { keyInput.emit("keypress", { name }); await running },
  }
}

test("opens a selected relative file in the session directory", async () => {
  const view = createHarness()
  view.select("some file.ts")
  await view.command.run()
  expect(view.spawn).toHaveBeenCalledWith("zed", ["--classic", view.directory, view.file], { detached: true, stdio: "ignore" })
  expect(view.child.unref).toHaveBeenCalledTimes(1)
})

test.each([
  ["some file.ts:42", ":42"],
  ["some file.ts:42:7", ":42"],
  ["`some file.ts:42:7`", ":42"],
  ['"some file.ts:42"', ":42"],
  ["'some file.ts'", ""],
])("preserves the selected line number without a column (%s)", async (selection, suffix) => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file + suffix])
})

test.each([
  "some file.ts:56–78",
  "some file.ts:56-78",
  "some file.ts:56–78.",
  "some file.ts:56-78:",
  "`some file.ts:56–78`.",
  "(**some file.ts:56-78**);",
  "  some file.ts:56–78.  ",
])("opens a file at the first line of a selected range (%s)", async selection => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${view.file}:56`])
})

test.each(["56–78", "56-78"])("preserves an existing filename ending in a line range (%s)", async range => {
  const view = createHarness()
  const file = `${view.file}:${range}`
  writeFileSync(file, "export const value = 2\n")
  view.select(file)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, file])
})

test.each([
  "some file.ts:42:",
  "some file.ts:42,",
  "some file.ts:42.",
  "some file.ts:42)",
  "some file.ts:42;",
  "some file.ts:42!",
  "some file.ts:42?",
  "some file.ts:42…",
  "some file.ts:42]",
  "some file.ts:42}",
  "some file.ts:42>",
  "some file.ts:42”",
  "some file.ts:42’",
  "some file.ts:42:).,",
  "some file.ts:42:7:",
  "`some file.ts:42`:",
  '"some file.ts:42",',
  "'some file.ts:42'.",
  "some file.ts:42`:",
  "  some file.ts:42:  ",
])("opens a file reference followed by punctuation (%s)", async selection => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${view.file}:42`])
})

test.each(["some file.ts:", "some file.ts).,", "`some file.ts`,"])(
  "opens a file reference without a line number after removing punctuation (%s)", async selection => {
    const view = createHarness()
    view.select(selection)
    await view.command.run()
    expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file])
  },
)

test.each([
  ["(some file.ts)", ""],
  ["(some file.ts:42)", ":42"],
  ["[some file.ts]", ""],
  ["[some file.ts:42]", ":42"],
  ["{some file.ts}", ""],
  ["{some file.ts:42}", ":42"],
  ["<some file.ts>", ""],
  ["<some file.ts:42>", ":42"],
  ["“some file.ts”", ""],
  ["“some file.ts:42”", ":42"],
  ["‘some file.ts’", ""],
  ["‘some file.ts:42’", ":42"],
])("opens a file reference inside paired brackets or quotes (%s)", async (selection, suffix) => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file + suffix])
})

test.each([
  ["*some file.ts*", ""],
  ["*some file.ts:42*", ":42"],
  ["**some file.ts**", ""],
  ["**some file.ts:42**", ":42"],
  ["_some file.ts_", ""],
  ["_some file.ts:42_", ":42"],
  ["__some file.ts__", ""],
  ["__some file.ts:42__", ":42"],
])("opens a file reference with paired Markdown emphasis (%s)", async (selection, suffix) => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file + suffix])
})

test.each(["(**`some file.ts:42:7`**);", "[‘_some file.ts:42_’]…"])(
  "preserves the line number through nested wrappers and trailing punctuation (%s)", async selection => {
    const view = createHarness()
    view.select(selection)
    await view.command.run()
    expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${view.file}:42`])
  },
)

test.each([":", ",", ".", ")", ").", "'", '"', "`", ";", "!", "?", "…", "]", "}", ">", "”", "’"])(
  "preserves punctuation in an existing filename (%s)", async punctuation => {
    const view = createHarness()
    const file = view.file + punctuation
    writeFileSync(file, "export const value = 2\n")
    view.select(file)
    await view.command.run()
    expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, file])
  },
)

test("preserves filename punctuation when removing punctuation after a line number", async () => {
  const view = createHarness()
  const file = view.file + ")."
  writeFileSync(file, "export const value = 2\n")
  view.select(`${file}:42:7:`)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${file}:42`])
})

test.each([
  "`some file.ts`", '"some file.ts"', "'some file.ts'", "“some file.ts”", "‘some file.ts’",
  "(some file.ts)", "[some file.ts]", "{some file.ts}", "<some file.ts>",
  "*some file.ts*", "**some file.ts**", "_some file.ts_", "__some file.ts__",
])("prefers an existing wrapped filename over removing its wrappers (%s)", async filename => {
  const view = createHarness()
  const file = join(view.directory, filename)
  writeFileSync(file, "export const value = 2\n")
  view.select(filename)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, file])
})

test("opens a selected absolute file", async () => {
  const view = createHarness()
  view.select(view.file)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file])
})

test("expands a selected home-relative file", async () => {
  const view = createHarness()
  view.select(`~/${relative(homedir(), view.file)}`)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, view.file])
})

test("passes the session directory with the selected file", async () => {
  const view = createHarness()
  const otherDirectory = mkdtempSync(join(tmpdir(), "zed-test-"))
  cleanups.push(() => rmSync(otherDirectory, { recursive: true, force: true }))
  const file = join(otherDirectory, "external.ts")
  writeFileSync(file, "export const value = 2\n")
  view.select(`${file}:42:7`)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${file}:42`])
})

test.each([
  "missing.ts", ".", "some file.ts\nmissing.ts", "some file.ts:0", "some file.ts:0:7", "some file.ts:0:",
  "missing.ts:42:", "some file.ts:42: explanation", "some file.ts:42:, missing.ts", ":,.)",
  "(**missing.ts:42**);", "[some file.ts:0];", "**some file.ts:42\nmissing.ts**",
  "some file.ts:0–78.", "some file.ts:0-78", "some file.ts:56–", "some file.ts:56--78", "missing.ts:56–78.",
])(
  "rejects selections that are not existing files (%s)", async selection => {
    const view = createHarness()
    view.select(selection)
    await view.command.run()
    expect(view.spawn).not.toHaveBeenCalled()
    expect(view.toast).toHaveBeenCalledWith({ title: "Zed", message: "Select an existing file path", variant: "error" })
  },
)

test.each([
  "*some file.ts", "some file.ts*", "_some file.ts", "some file.ts_", "(some file.ts]",
  "#some file.ts", "@some file.ts", "-some file.ts", "+some file.ts", "some file.ts\\",
])("does not strip unmatched wrappers or meaningful path symbols (%s)", async selection => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn).not.toHaveBeenCalled()
  expect(view.toast).toHaveBeenCalledWith({ title: "Zed", message: "Select an existing file path", variant: "error" })
})

test.each([undefined, "   "])("opens the session directory without selected text (%s)", async selection => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test("opens the plugin location outside a session", async () => {
  const view = createHarness()
  view.select(view.file)
  view.setRoute({ type: "home" })
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", "/plugin-location"])
})

test("opens the directory when selected text belongs to the prompt editor", async () => {
  const view = createHarness()
  view.edit(view.file)
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test("retains the selected file while the leader shortcut clears the highlight", async () => {
  const view = createHarness()
  view.select("some file.ts:42:7")
  await view.press("leader")
  expect(view.spawn).not.toHaveBeenCalled()
  await view.press("z")
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory, `${view.file}:42`])
})

test("does not reuse a file selection after an unrelated key", async () => {
  const view = createHarness()
  view.select(view.file)
  await view.press("a")
  await view.press("leader")
  await view.press("z")
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test("does not reuse a file selection after cancelling the leader shortcut", async () => {
  const view = createHarness()
  view.select(view.file)
  await view.press("leader")
  await view.press("escape")
  await view.press("leader")
  await view.press("z")
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test("does not reuse a captured selection in a different session", async () => {
  const view = createHarness()
  view.select(view.file)
  await view.press("leader")
  view.setRoute({ type: "session", sessionID: "session-b" })
  await view.press("z")
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test("does not reuse a captured selection for a palette or slash command", async () => {
  const view = createHarness()
  view.select(view.file)
  await view.press("a")
  await view.command.run()
  expect(view.spawn.mock.calls[0][1]).toEqual(["--classic", view.directory])
})

test.each([undefined, "some file.ts:42:7"])("does not show a toast after Zed exits successfully (%s)", async selection => {
  const view = createHarness()
  view.select(selection)
  await view.command.run()
  view.child.emit("exit", 0)
  expect(view.toast).not.toHaveBeenCalled()
})

test("shows a launch error without reporting success", async () => {
  const view = createHarness()
  await view.command.run()
  view.child.emit("error", new Error("spawn zed ENOENT"))
  expect(view.toast).toHaveBeenCalledWith({ title: "Zed", message: "spawn zed ENOENT", variant: "error" })
})

test("reports an unsuccessful Zed exit", async () => {
  const view = createHarness()
  await view.command.run()
  view.child.emit("exit", 1)
  expect(view.toast).toHaveBeenCalledWith({ title: "Zed", message: "zed exited with code 1", variant: "error" })
})

test("removes the selection capture listener when the plugin unloads", () => {
  const view = createHarness()
  expect(view.keyInput.listenerCount("keypress")).toBe(2)
  view.stop()
  expect(view.keyInput.listenerCount("keypress")).toBe(1)
})
