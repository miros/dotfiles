import { afterEach, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { createElement, insert, setProp, testRender, type JSX } from "@opentui/solid"
import { createComponent, createSignal, Show } from "solid-js"
import plugin from "./tui"

type Slot = {
  append: string
  render(input: { sessionID: string }): JSX.Element
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

async function createHarness() {
  const [sidebarVisible, setSidebarVisible] = createSignal(true)
  const [registered, setRegistered] = createSignal(true)
  const [sessionID, setSessionID] = createSignal("session-a")
  const sidebarAction = mock(() => {})
  const pathAction = mock(() => {})
  const dispatch = mock((command: string) => {
    if (command === "session.sidebar.toggle") setSidebarVisible(value => !value)
  })
  let slot: Slot
  const context = {
    theme: { text: { muted: "#888888" } },
    keymap: { dispatch },
    ui: {
      slot: (claim: Slot) => {
        slot = claim
        return () => setRegistered(false)
      },
    },
  } as unknown as Plugin.Context
  const stop = plugin.setup(context) as () => void
  cleanups.push(stop)
  const input = { get sessionID() { return sessionID() } }
  const view = await testRender(() => createComponent(Show, {
    get when() { return sidebarVisible() },
    get children() {
      const sidebar = createElement("box")
      setProp(sidebar, "width", "100%")
      setProp(sidebar, "height", "100%")
      setProp(sidebar, "onMouseDown", sidebarAction)
      setProp(sidebar, "onMouseUp", sidebarAction)
      const footer = createElement("box")
      setProp(footer, "flexShrink", 0)
      setProp(footer, "gap", 1)
      setProp(footer, "paddingTop", 1)
      const path = createElement("text")
      setProp(path, "onMouseUp", pathAction)
      insert(path, "~/pjs/jobs-bot:main")
      const contribution = createElement("box")
      insert(contribution, () => registered() && slot.append === "sidebar.footer" ? slot.render(input) : null)
      insert(footer, [path, contribution])
      const content = createElement("text")
      setProp(content, "flexGrow", 1)
      insert(content, "Existing sidebar content")
      insert(sidebar, [content, footer])
      return sidebar
    },
  }), { width: 30, height: 5 })
  cleanups.push(() => view.renderer.destroy())
  await view.flush()

  return {
    ...view,
    dispatch,
    sidebarAction,
    pathAction,
    sidebarVisible,
    setSidebarVisible,
    setSessionID,
    stop,
  }
}

test("shows Hide left-aligned on the last row below the path", async () => {
  const view = await createHarness()
  const lines = view.captureCharFrame().split("\n")
  expect(lines[0]).toContain("Existing sidebar content")
  expect(lines[2]).toContain("~/pjs/jobs-bot:main")
  expect(lines[4]).toBe("[Hide]                        ")
})

test("left-clicking Hide closes the sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 4)
  await view.flush()
  expect(view.dispatch).toHaveBeenCalledWith("session.sidebar.toggle")
  expect(view.dispatch).toHaveBeenCalledTimes(1)
  expect(view.sidebarVisible()).toBe(false)
  expect(view.captureCharFrame()).not.toContain("[Hide]")
})

test("Hide activates only after mouse release", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 4)
  await view.flush()
  expect(view.sidebarVisible()).toBe(true)
  expect(view.dispatch).not.toHaveBeenCalled()
  await view.mockMouse.release(2, 4)
  expect(view.sidebarVisible()).toBe(false)
})

test("right-clicking Hide leaves the sidebar open", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 4, 2)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("leaving Hide cancels a pending click", async () => {
  const view = await createHarness()
  await view.mockMouse.moveTo(2, 4)
  await view.mockMouse.pressDown(2, 4)
  await view.mockMouse.moveTo(2, 3)
  await view.mockMouse.moveTo(2, 4)
  await view.mockMouse.release(2, 4)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("dragging over Hide cancels a pending click", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 4)
  await view.mockMouse.moveTo(3, 4)
  await view.mockMouse.release(3, 4)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("releasing over Hide without pressing it leaves the sidebar open", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 3)
  await view.mockMouse.release(2, 4)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("clicking Hide does not trigger the sidebar action", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 4)
  expect(view.sidebarAction).not.toHaveBeenCalled()
  expect(view.pathAction).not.toHaveBeenCalled()
})

test("clicking the path preserves its action without hiding the sidebar", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 2)
  expect(view.pathAction).toHaveBeenCalledTimes(1)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("switching sessions cancels a pending Hide click", async () => {
  const view = await createHarness()
  await view.mockMouse.pressDown(2, 4)
  view.setSessionID("session-b")
  await view.flush()
  await view.mockMouse.release(2, 4)
  expect(view.dispatch).not.toHaveBeenCalled()
  expect(view.sidebarVisible()).toBe(true)
})

test("Hide works again after the sidebar is reopened", async () => {
  const view = await createHarness()
  await view.mockMouse.click(2, 4)
  await view.flush()
  view.setSidebarVisible(true)
  await view.flush()
  expect(view.captureCharFrame()).toContain("[Hide]")
  await view.mockMouse.click(2, 4)
  expect(view.dispatch).toHaveBeenCalledTimes(2)
  expect(view.sidebarVisible()).toBe(false)
})

test("unloading removes Hide and preserves existing sidebar content and path", async () => {
  const view = await createHarness()
  view.stop()
  await view.flush()
  expect(view.captureCharFrame()).not.toContain("[Hide]")
  expect(view.captureCharFrame()).toContain("Existing sidebar content")
  expect(view.captureCharFrame()).toContain("~/pjs/jobs-bot:main")
  expect(view.sidebarVisible()).toBe(true)
})
