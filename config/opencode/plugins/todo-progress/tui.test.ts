import { afterEach, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { createElement, insert, setProp, testRender, type JSX } from "@opentui/solid"
import { createComponent, createSignal, Show } from "solid-js"
import plugin from "./tui"

type Todo = { status: "pending" | "in_progress" | "completed" | "cancelled" }
type Snapshot = { todos: Todo[] }
type Slot = {
  append: string
  render(input: { sessionID?: string; mode: "normal"; showDetails: boolean }): JSX.Element
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

async function createHarness(options: {
  todos?: Todo[]
  sessionID?: string
  running?: boolean
  sidebarVisible?: boolean
  list?: (input: { sessionID: string }) => Promise<Snapshot>
} = {}) {
  let todos = options.todos ?? [{ status: "completed" }, { status: "pending" }]
  const [sessionID, setSessionID] = createSignal<string | undefined>(options.sessionID ?? "session-a")
  const [running, setRunning] = createSignal(options.running ?? true)
  const [sidebarVisible, setSidebarVisible] = createSignal(options.sidebarVisible ?? false)
  const handlers = new Set<(event: { data: { sessionID: string } }) => void>()
  const list = mock(options.list ?? (async () => ({ todos })))
  const slots = new Map<string, Slot>()
  const dispatch = mock(() => setSidebarVisible(value => !value))
  const directoryAction = mock(() => {})
  const unregister = mock(() => {})
  const rpc = {
    list,
    events: {
      on: (_name: string, handler: (event: { data: { sessionID: string } }) => void) => {
        handlers.add(handler)
        return () => { handlers.delete(handler) }
      },
    },
  }
  const context = {
    client: { rpc: () => rpc },
    data: { session: { status: () => running() ? "running" : "idle" } },
    theme: { text: { muted: "#888888" } },
    keymap: { dispatch },
    ui: {
      slot: (claim: Slot) => {
        slots.set(claim.append, claim)
        return unregister
      },
    },
  } as unknown as Plugin.Context
  const stop = plugin.setup(context) as () => void
  cleanups.push(stop)
  const input = {
    get sessionID() { return sessionID() },
    mode: "normal" as const,
    showDetails: true,
  }
  const view = await testRender(() => {
    const footer = createElement("box")
    setProp(footer, "onMouseDown", directoryAction)
    setProp(footer, "onMouseUp", directoryAction)
    insert(footer, () => slots.get("prompt.footer.status")!.render(input))
    return [
      footer,
      createComponent(Show, {
        get when() { return sidebarVisible() },
        get children() { return slots.get("sidebar.content")!.render(input) },
      }),
    ]
  }, { width: 40, height: 3 })
  cleanups.push(() => view.renderer.destroy())
  await view.flush()

  return {
    ...view,
    list,
    dispatch,
    directoryAction,
    handlers,
    unregister,
    sessionID,
    setSessionID,
    setRunning,
    sidebarVisible,
    setSidebarVisible,
    changeTodos(next: Todo[], id = sessionID()!) {
      todos = next
      for (const handler of handlers) handler({ data: { sessionID: id } })
    },
  }
}

test("shows completed todos out of the total", async () => {
  const view = await createHarness({
    todos: [{ status: "completed" }, ...Array.from({ length: 5 }, () => ({ status: "pending" as const }))],
  })
  expect(view.captureCharFrame()).toContain("todo:1/6")
})

test("excludes cancelled todos from the total", async () => {
  const view = await createHarness({
    todos: [{ status: "completed" }, { status: "in_progress" }, { status: "cancelled" }],
  })
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("shows zero completed todos while work is pending", async () => {
  const view = await createHarness({ todos: [{ status: "in_progress" }, { status: "pending" }] })
  expect(view.captureCharFrame()).toContain("todo:0/2")
})

test("hides the counter when there are no todos", async () => {
  const view = await createHarness({ todos: [] })
  expect(view.captureCharFrame()).not.toContain("todo:")
})

test("hides the counter when every todo is cancelled", async () => {
  const view = await createHarness({ todos: [{ status: "cancelled" }] })
  expect(view.captureCharFrame()).not.toContain("todo:")
})

test("shows the counter only while the session is running", async () => {
  const view = await createHarness({ running: false })
  expect(view.captureCharFrame()).not.toContain("todo:")
  view.setRunning(true)
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/2")
  view.setRunning(false)
  await view.flush()
  expect(view.captureCharFrame()).not.toContain("todo:")
})

test("refreshes the counter when the current session's todos change", async () => {
  const view = await createHarness()
  view.changeTodos([{ status: "completed" }, { status: "completed" }])
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:2/2")
})

test("ignores todo changes from other sessions", async () => {
  const view = await createHarness()
  view.changeTodos([{ status: "completed" }], "session-b")
  await view.flush()
  expect(view.list).toHaveBeenCalledTimes(1)
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("loads the new session's todos when switching sessions", async () => {
  const view = await createHarness({
    list: async ({ sessionID }) => ({
      todos: sessionID === "session-a" ? [{ status: "pending" }] : [{ status: "completed" }],
    }),
  })
  expect(view.captureCharFrame()).toContain("todo:0/1")
  view.setSessionID("session-b")
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/1")
  expect(view.handlers.size).toBe(1)
})

test("does not show a previous session's delayed response", async () => {
  const previous = Promise.withResolvers<Snapshot>()
  const view = await createHarness({
    list: ({ sessionID }) => sessionID === "session-a"
      ? previous.promise
      : Promise.resolve({ todos: [{ status: "pending" }] }),
  })
  view.setSessionID("session-b")
  await view.flush()
  previous.resolve({ todos: [{ status: "completed" }] })
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:0/1")
})

test("does not replace newer todos with a delayed response", async () => {
  const initial = Promise.withResolvers<Snapshot>()
  let calls = 0
  const view = await createHarness({
    list: () => ++calls === 1
      ? initial.promise
      : Promise.resolve({ todos: [{ status: "completed" }] }),
  })
  view.changeTodos([])
  await view.flush()
  initial.resolve({ todos: [{ status: "pending" }] })
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/1")
})

test("hides the counter when the todo service fails and recovers on a change", async () => {
  let fail = true
  const view = await createHarness({
    list: async () => {
      if (fail) throw new Error("Todo service unavailable")
      return { todos: [{ status: "completed" }] }
    },
  })
  expect(view.captureCharFrame()).not.toContain("todo:")
  fail = false
  view.changeTodos([])
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/1")
})

test("does not load todos without a session", async () => {
  const view = await createHarness()
  view.setSessionID(undefined)
  await view.flush()
  expect(view.list).toHaveBeenCalledTimes(1)
  expect(view.captureCharFrame()).not.toContain("todo:")
  expect(view.handlers.size).toBe(0)
})

test("clicking the counter opens a hidden sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 0)
  expect(view.dispatch).toHaveBeenCalledWith("session.sidebar.toggle")
  expect(view.sidebarVisible()).toBe(true)
})

test("clicking the counter does not trigger the directory action", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 0)
  expect(view.directoryAction).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("opens the sidebar only after mouse release", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 0)
  await view.flush()
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(false)
  await view.mockMouse.release(2, 0)
  expect(view.dispatch).toHaveBeenCalledTimes(1)
  expect(view.sidebarVisible()).toBe(true)
})

test("releasing over the counter without pressing it does not open the sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(20, 2)
  await view.mockMouse.release(2, 0)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(false)
})

test("leaving the counter cancels a pending click", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 0)
  await view.mockMouse.moveTo(2, 2)
  await view.mockMouse.moveTo(2, 0)
  await view.mockMouse.release(2, 0)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(false)
})

test("clicking the counter leaves a visible sidebar open", async () => {
  const view = await createHarness({ sidebarVisible: true })
  await view.mockMouse.click(2, 0)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("clicking twice does not close the sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 0)
  await view.mockMouse.click(2, 0)
  expect(view.dispatch).toHaveBeenCalledTimes(1)
  expect(view.sidebarVisible()).toBe(true)
})

test("opens the sidebar again after it has been hidden", async () => {
  const view = await createHarness({ sidebarVisible: true })
  view.setSidebarVisible(false)
  await view.flush()
  await view.mockMouse.click(2, 0)
  expect(view.dispatch).toHaveBeenCalledTimes(1)
  expect(view.sidebarVisible()).toBe(true)
})

test("right-clicking the counter does not open the sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 0, 2)
  expect(view.dispatch).not.toHaveBeenCalled()
})

test("unmounting the footer removes its todo subscription", async () => {
  const view = await createHarness()
  expect(view.handlers.size).toBe(1)
  view.renderer.destroy()
  expect(view.handlers.size).toBe(0)
})
