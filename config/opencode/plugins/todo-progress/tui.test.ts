import { afterEach, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { createElement, insert, setProp, testRender, type JSX } from "@opentui/solid"
import { createComponent, createSignal, Show } from "solid-js"
import plugin from "./tui"

type Todo = { status: "pending" | "in_progress" | "completed" | "cancelled" }
type ToolStatus = "running" | "completed" | "error"
type Message = {
  id: string
  type: string
  content: Array<{ type: string; name: string; state: { status: ToolStatus; input: { todos: Todo[] } } }>
}
type Slot = {
  append: string
  render(input: { sessionID?: string; mode: "normal"; showDetails: boolean }): JSX.Element
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

let nextMessageID = 0
function todowrite(todos: Todo[], status: ToolStatus = "completed"): Message {
  return {
    id: `message-${++nextMessageID}`,
    type: "assistant",
    content: [{ type: "tool", name: "todowrite", state: { status, input: { todos } } }],
  }
}

async function createHarness(options: {
  todos?: Todo[]
  messages?: Record<string, Message[]>
  sessionID?: string
  running?: boolean
  sidebarVisible?: boolean
} = {}) {
  const [messages, setMessages] = createSignal<Record<string, Message[]>>(
    options.messages ?? { "session-a": [todowrite(options.todos ?? [{ status: "completed" }, { status: "pending" }])] },
  )
  const [revert, setRevert] = createSignal<Record<string, string | undefined>>({})
  const [sessionID, setSessionID] = createSignal<string | undefined>(options.sessionID ?? "session-a")
  const [running, setRunning] = createSignal(options.running ?? true)
  const [sidebarVisible, setSidebarVisible] = createSignal(options.sidebarVisible ?? false)
  const slots = new Map<string, Slot>()
  const dispatch = mock(() => setSidebarVisible(value => !value))
  const directoryAction = mock(() => {})
  const unregister = mock(() => {})
  const context = {
    data: {
      session: {
        status: () => running() ? "running" : "idle",
        get: (id: string) => ({ id, revert: revert()[id] ? { messageID: revert()[id] } : undefined }),
        message: { list: (id: string) => messages()[id] ?? [] },
      },
    },
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

  const addMessage = (message: Message, id = sessionID()!) => {
    setMessages(current => ({ ...current, [id]: [...(current[id] ?? []), message] }))
  }

  return {
    ...view,
    dispatch,
    directoryAction,
    unregister,
    sessionID,
    setSessionID,
    setRunning,
    sidebarVisible,
    setSidebarVisible,
    addMessage,
    changeTodos(next: Todo[], id = sessionID()!) {
      addMessage(todowrite(next), id)
    },
    revertTo(messageID: string, id = sessionID()!) {
      setRevert(current => ({ ...current, [id]: messageID }))
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

test("shows todo:[] when there are no todos", async () => {
  const view = await createHarness({ todos: [] })
  expect(view.captureCharFrame()).toContain("todo:[]")
})

test("shows todo:[] when every todo is cancelled", async () => {
  const view = await createHarness({ todos: [{ status: "cancelled" }] })
  expect(view.captureCharFrame()).toContain("todo:[]")
})

test("shows todo:[] when todos are cleared", async () => {
  const view = await createHarness()
  expect(view.captureCharFrame()).toContain("todo:1/2")
  view.changeTodos([])
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:[]")
})

test("keeps the counter visible when the session becomes idle", async () => {
  const view = await createHarness({ running: false })
  expect(view.captureCharFrame()).toContain("todo:1/2")
  view.setRunning(true)
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/2")
  view.setRunning(false)
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("shows todo:[] in an idle session with no todos", async () => {
  const view = await createHarness({ todos: [], running: false })
  expect(view.captureCharFrame()).toContain("todo:[]")
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
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("loads the new session's todos when switching sessions", async () => {
  const view = await createHarness({
    messages: {
      "session-a": [todowrite([{ status: "pending" }])],
      "session-b": [todowrite([{ status: "completed" }])],
    },
  })
  expect(view.captureCharFrame()).toContain("todo:0/1")
  view.setSessionID("session-b")
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/1")
})

test("uses the latest completed todowrite call", async () => {
  const view = await createHarness({
    messages: {
      "session-a": [
        todowrite([{ status: "pending" }]),
        todowrite([{ status: "completed" }, { status: "completed" }, { status: "pending" }]),
      ],
    },
  })
  expect(view.captureCharFrame()).toContain("todo:2/3")
})

test("ignores todowrite calls that have not completed", async () => {
  const view = await createHarness()
  view.addMessage(todowrite([{ status: "completed" }], "running"))
  view.addMessage(todowrite([{ status: "pending" }], "error"))
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("ignores todowrite calls after the revert point", async () => {
  const reverted = todowrite([{ status: "completed" }])
  const view = await createHarness()
  view.addMessage(reverted)
  view.addMessage(todowrite([{ status: "completed" }, { status: "completed" }]))
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:2/2")
  view.revertTo(reverted.id)
  await view.flush()
  expect(view.captureCharFrame()).toContain("todo:1/2")
})

test("shows todo:[] when the session has no todowrite calls", async () => {
  const view = await createHarness({ messages: { "session-a": [] } })
  expect(view.captureCharFrame()).toContain("todo:[]")
})

test("hides the counter without a session", async () => {
  const view = await createHarness()
  view.setSessionID(undefined)
  await view.flush()
  expect(view.captureCharFrame()).not.toContain("todo:")
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
