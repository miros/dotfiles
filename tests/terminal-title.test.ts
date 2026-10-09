import { afterEach, expect, mock, test } from "bun:test"
import { createRequire } from "node:module"

const require = createRequire(new URL("../config/opencode/plugins/terminal-title/package.json", import.meta.url))
const solid = await import(require.resolve("solid-js/dist/solid.js"))
mock.module("solid-js", () => solid)
const { createRoot, createSignal } = solid
const { default: plugin } = await import("../config/opencode/plugins/terminal-title/tui")
const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

type Route = { type: "home" } | { type: "session"; sessionID: string }
type Session = { location?: { directory: string } }

function mount(directory: string | null = "/projects/launch") {
  const [route, setRoute] = createSignal({ type: "home" } as Route)
  const [sessions, setSessions] = createSignal({} as Record<string, Session>)
  const [location, setLocation] = createSignal(undefined as { directory: string } | undefined)
  const setTerminalTitle = mock((_title: string) => {})
  let dispose = () => {}
  const context = {
    location: directory ? { directory } : undefined,
    renderer: { setTerminalTitle },
    data: {
      session: { get: (id: string) => sessions()[id] },
      location: { default: location },
    },
    ui: {
      router: { current: route },
      slot: ({ append, render }: { append: string; render: () => unknown }) => {
        expect(append).toBe("app")
        createRoot((cleanup: () => void) => {
          dispose = cleanup
          expect(render()).toBeNull()
        })
        return () => dispose()
      },
    },
  }

  const cleanup = plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
  if (typeof cleanup !== "function") throw new Error("Plugin did not return slot cleanup")
  cleanups.push(cleanup)

  return { setRoute, setSessions, setLocation, setTerminalTitle, cleanup }
}

test("shows the launch folder on the home screen", () => {
  const { setTerminalTitle } = mount("/Users/miros/.dotfiles")
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC miros/.dotfiles")
})

test("shows the active session folder", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({ first: { location: { directory: "/projects/current" } } })
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/current")
})

test("updates when the active session changes", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({
    first: { location: { directory: "/projects/first" } },
    second: { location: { directory: "/projects/second" } },
  })
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/first")
  setRoute({ type: "session", sessionID: "second" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/second")
})

test("updates when the active session moves", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({ first: { location: { directory: "/projects/original" } } })
  setRoute({ type: "session", sessionID: "first" })
  setSessions({ first: { location: { directory: "/worktrees/moved" } } })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC worktrees/moved")
})

test("updates when the parent changes but the folder name stays the same", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({ first: { location: { directory: "/projects/current" } } })
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/current")
  setSessions({ first: { location: { directory: "/worktrees/current" } } })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC worktrees/current")
})

test("updates when active session data arrives", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/launch")
  setSessions({ first: { location: { directory: "/projects/loaded" } } })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/loaded")
})

test("restores the launch folder when returning home", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({ first: { location: { directory: "/projects/current" } } })
  setRoute({ type: "session", sessionID: "first" })
  setRoute({ type: "home" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/launch")
})

test("uses the default location when the launch location is unavailable", () => {
  const { setLocation, setTerminalTitle } = mount(null)
  setLocation({ directory: "/projects/default" })
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/default")
})

test("removes terminal control characters", () => {
  const { setTerminalTitle } = mount("/proj\x1bects/fold\x1ber\x07\n\x7f\x9c")
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC projects/folder")
})

test("shows the filesystem root as a slash", () => {
  const { setTerminalTitle } = mount("/")
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC /")
})

test("shows a folder directly under the filesystem root", () => {
  const { setTerminalTitle } = mount("/projects")
  expect(setTerminalTitle).toHaveBeenLastCalledWith("OC /projects")
})

test("does not rewrite an unchanged folder title", () => {
  const { setRoute, setSessions, setTerminalTitle } = mount()
  setSessions({ first: { location: { directory: "/projects/launch" } } })
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenCalledTimes(1)
})

test("stops updating after the plugin unloads", () => {
  const { setRoute, setSessions, setTerminalTitle, cleanup } = mount()
  cleanup()
  setSessions({ first: { location: { directory: "/projects/current" } } })
  setRoute({ type: "session", sessionID: "first" })
  expect(setTerminalTitle).toHaveBeenCalledTimes(1)
})
