import { afterEach, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import type { DialogOptions, KeymapCommand, KeymapLayer, KeymapPending } from "@opencode/plugin/tui/context"
import { BoxRenderable, InputRenderable, TextareaRenderable, TextRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { createElement, insert, setProp, testRender, type JSX } from "@opentui/solid"
import { createComponent, createEffect, createSignal, getOwner, onCleanup, Show } from "solid-js"
import plugin from "./tui"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

async function createHarness(initialValue = "") {
  const [content, setContent] = createSignal<(() => JSX.Element) | undefined>()
  const view = await testRender(() => {
    const root = createElement("box")
    setProp(root, "width", "100%")
    setProp(root, "height", "100%")
    setProp(root, "position", "absolute")
    setProp(root, "zIndex", 100)
    createEffect(() => setProp(root, "visible", !!content()))
    insert(root, () => createComponent(Show, {
      get when() { return content() },
      keyed: true,
      children: (render: () => JSX.Element) => {
        const host = createElement("box")
        setProp(host, "position", "absolute")
        setProp(host, "width", "100%")
        setProp(host, "height", "100%")
        setProp(host, "zIndex", 100)
        setProp(host, "alignItems", "center")
        setProp(host, "justifyContent", "center")
        const dialog = createElement("box")
        setProp(dialog, "width", 74)
        insert(dialog, render())
        insert(host, dialog)
        return host
      },
    }))
    return root
  }, { width: 80, height: 18, kittyKeyboard: true })
  const { renderer } = view
  cleanups.push(() => renderer.destroy())
  let route: { type: "session"; sessionID: string } | { type: "home" } = { type: "session", sessionID: "session-a" }
  let mode = "base"
  let pending: readonly KeymapPending[] = []
  let layer: KeymapLayer
  let command: KeymapCommand
  let running: Promise<void | false> = Promise.resolve()
  let onClose: (() => void) | undefined
  const layers: KeymapLayer[] = []
  let draft = initialValue
  const submit = mock(() => {})
  const send = mock(async () => {})
  const editor = new TextareaRenderable(renderer, {
    id: "session-prompt", initialValue, width: "100%", height: 6, top: 12, position: "absolute",
    onContentChange: () => { draft = editor.plainText },
    onSubmit: submit,
  })
  editor.traits = { suspend: true, capture: ["tab"], ...{ owner: "opencode", role: "prompt" } }
  const transcript = new TextRenderable(renderer, {
    id: "transcript", content: "Original plan", width: "100%", height: 7, position: "absolute", top: 0,
  })
  renderer.root.add(transcript)
  renderer.root.add(editor)
  editor.focus()

  const clear = mock(() => {
    const closed = onClose
    onClose = undefined
    setContent(undefined)
    mode = "base"
    if (!editor.isDestroyed) editor.focus()
    closed?.()
  })
  const show = mock((render: () => JSX.Element, closed?: () => void) => {
    clear()
    mode = "dialog"
    onClose = closed
    setContent(() => render)
  })
  const set = mock((_options: DialogOptions) => {})
  const toast = mock(() => {})
  renderer.keyInput.on("keypress", event => {
    renderer.clearSelection()
    if (mode === "dialog") {
      const bind = [event.ctrl && "ctrl", event.shift && "shift", event.meta && "alt", event.name].filter(Boolean).join("+")
      for (const current of [...layers].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
        if (current.mode !== "global" && current.mode !== mode) continue
        const action = current.commands?.find(item => item.bind === bind)
        if (!action || action.run(undefined, event) === false) continue
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.name === "escape") {
        event.preventDefault()
        clear()
      }
      return
    }
    if (event.ctrl && event.name === "x") {
      event.preventDefault()
      pending = [{ key: "ctrl+x" }]
      return
    }
    const opens = pending.length > 0 && event.name === "p" && command.bind === "<leader>p"
    pending = []
    const enabled = typeof command.enabled === "function" ? command.enabled() : command.enabled !== false
    if (opens && enabled && layer.mode === mode) {
      event.preventDefault()
      running = Promise.resolve(command.run(undefined, event))
    }
  })

  const context = {
    renderer,
    client: { session: { prompt: send } },
    keymap: {
      pending: () => pending,
      mode: { current: () => mode },
      layer: (factory: () => KeymapLayer) => {
        const current = factory()
        layers.push(current)
        if (getOwner()) onCleanup(() => { layers.splice(layers.indexOf(current), 1) })
        const registered = current.commands?.find(item => item.id === "local.plan-reviewer.comment")
        if (registered) { layer = current; command = registered }
      },
    },
    theme: {
      text: { base: "#eeeeee", muted: "#999999", action: { primary: { base: "#a6e22e" } } },
      background: { formfield: { base: "#272822" } },
    },
    ui: { router: { current: () => route }, dialog: { show, set, clear }, toast: { show: toast } },
  } as unknown as Plugin.Context
  const stop = plugin.setup(context) as () => void
  cleanups.push(stop)
  await view.flush()

  return {
    ...view, editor, transcript, show, toast, submit, send, stop,
    command: command!,
    draft: () => draft,
    setRoute(value: typeof route) { route = value },
    setMode(value: string) { mode = value },
    expireLeader() { pending = [] },
    async select(text = "Original plan") {
      transcript.content = text
      await view.flush()
      const lines = text.split("\n")
      renderer.startSelection(transcript, transcript.x, transcript.y)
      renderer.updateSelection(transcript, transcript.x + lines.at(-1)!.length - 1, transcript.y + lines.length - 1, { finishDragging: true })
    },
    async open() {
      view.mockInput.pressKey("x", { ctrl: true })
      view.mockInput.pressKey("p")
      await view.flush()
    },
    async comment(value: string | undefined) {
      await view.flush()
      if (value === undefined) clear()
      else {
        const input = renderer.root.findDescendantById("plan-reviewer-comment") as TextareaRenderable
        input.setText(value)
        input.gotoBufferEnd()
        input.focus()
        view.mockInput.pressEnter()
      }
      await running
      await view.flush()
    },
    async typeComment(value: string) {
      await view.flush()
      await view.mockInput.typeText(value)
      view.mockInput.pressEnter()
      await running
      await view.flush()
    },
    commentInput: () => renderer.root.findDescendantById("plan-reviewer-comment") as TextareaRenderable,
    wait: () => running,
  }
}

test("appends quoted text and comment without submitting", async () => {
  const view = await createHarness()
  await view.mockMouse.drag(0, 0, 12, 0)
  expect(view.renderer.getSelection()?.getSelectedText()).toBe("Original plan")
  await view.open()
  expect(view.show).toHaveBeenCalledTimes(1)
  await view.typeComment("Use a simpler approach")
  expect(view.editor.plainText).toBe("> Original plan\n\nUse a simpler approach")
  expect(view.draft()).toBe("> Original plan\n\nUse a simpler approach")
  expect(view.renderer.currentFocusedEditor).toBe(view.editor)
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("appends comments to an active prompt marked suspended", async () => {
  const view = await createHarness("Existing prompt")
  expect(view.editor.traits.suspend).toBe(true)
  await view.select()
  await view.open()
  expect(view.show).toHaveBeenCalledTimes(1)
  await view.typeComment("Revise this")
  expect(view.draft()).toBe("Existing prompt\n\n> Original plan\n\nRevise this")
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("shows the selected passage above the comment input", async () => {
  const view = await createHarness()
  await view.select("First step\n  Next step")
  await view.open()
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection")!
  const text = view.renderer.root.findDescendantById("plan-reviewer-selection-text") as TextRenderable
  expect(text.plainText).toBe("First step\n  Next step")
  expect(preview.screenY + preview.height).toBeLessThan(view.commentInput().screenY)
  expect(view.renderer.currentFocusedEditor).toBe(view.commentInput())
  expect(view.captureCharFrame()).toContain("First step")
  expect(view.captureCharFrame()).toContain("Next step")
  await view.comment("Revise this")
  expect(view.draft()).toBe("> First step\n>   Next step\n\nRevise this")
})

test("uses five visible lines for comments", async () => {
  const view = await createHarness()
  await view.select()
  await view.open()
  expect(view.commentInput().height).toBe(5)
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection")!
  expect(preview.height).toBe(1)
  await view.comment(undefined)
})

test("shows six preview lines when terminal space allows", async () => {
  const view = await createHarness()
  view.resize(80, 26)
  await view.select("First step\nSecond step\nThird step\nFourth step\nFifth step\nSixth step\nSeventh step")
  await view.open()
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection") as ScrollBoxRenderable
  expect(preview.height).toBe(6)
  expect(preview.scrollHeight).toBeGreaterThan(preview.viewport.height)
  expect(view.commentInput().height).toBe(5)
  await view.comment(undefined)
})

test("scrolls long selected passages without enlarging the comment box", async () => {
  const view = await createHarness()
  await view.select("First step\nSecond step\nThird step\nFourth step\nFifth step\nSixth step")
  await view.open()
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection") as ScrollBoxRenderable
  expect(preview.height).toBeLessThanOrEqual(4)
  expect(preview.scrollHeight).toBeGreaterThan(preview.viewport.height)
  await view.mockMouse.scroll(preview.screenX + 2, preview.screenY + 1, "down")
  await view.mockMouse.scroll(preview.screenX + 2, preview.screenY + 1, "down")
  await view.mockMouse.scroll(preview.screenX + 2, preview.screenY + 1, "down")
  await view.flush()
  expect(preview.scrollTop).toBeGreaterThan(0)
  const lastPreviewLine = preview.viewport.screenY + preview.viewport.height - 1
  expect(view.captureCharFrame().split("\n")[lastPreviewLine]).toContain("Sixth step")
  expect(view.commentInput().height).toBe(5)
  expect(view.renderer.currentFocusedEditor).toBe(view.commentInput())
  await view.comment(undefined)
})

test("wraps selected text within the preview", async () => {
  const view = await createHarness()
  const selection = "A selected paragraph ".repeat(3) + "more context."
  await view.select(selection)
  await view.open()
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection") as ScrollBoxRenderable
  const text = view.renderer.root.findDescendantById("plan-reviewer-selection-text") as TextRenderable
  expect(text.plainText).toBe(selection)
  expect(preview.height).toBeGreaterThan(1)
  expect(preview.height).toBeLessThanOrEqual(4)
  await view.comment(undefined)
})

test("Shift+Enter adds a newline and Enter confirms the comment", async () => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  await view.mockInput.typeText("First line")
  view.mockInput.pressEnter({ shift: true })
  await view.mockInput.typeText("Second line")
  await view.flush()
  expect(view.commentInput().plainText).toBe("First line\nSecond line")
  expect(view.draft()).toBe("Existing prompt")
  expect(view.send).not.toHaveBeenCalled()
  view.mockInput.pressEnter()
  await view.wait()
  expect(view.draft()).toBe("Existing prompt\n\n> Original plan\n\nFirst line\nSecond line")
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("pasting a comment preserves blank lines", async () => {
  const view = await createHarness()
  await view.select()
  await view.open()
  await view.mockInput.pasteBracketedText("First line\n\nLast line")
  expect(view.commentInput().plainText).toBe("First line\n\nLast line")
  view.mockInput.pressEnter()
  await view.wait()
  expect(view.draft()).toBe("> Original plan\n\nFirst line\n\nLast line")
})

test("shows keyboard hints without action buttons", async () => {
  const view = await createHarness()
  await view.select()
  await view.open()
  expect(view.renderer.root.findDescendantById("plan-reviewer-ok")).toBeUndefined()
  expect(view.renderer.root.findDescendantById("plan-reviewer-cancel")).toBeUndefined()
  expect(view.captureCharFrame()).toContain("Shift+Enter newline · Enter confirm · Esc cancel")
  await view.mockInput.typeText("First line")
  view.mockInput.pressEnter({ shift: true })
  await view.mockInput.typeText("Second line")
  view.mockInput.pressEnter()
  await view.wait()
  expect(view.draft()).toBe("> Original plan\n\nFirst line\nSecond line")
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("Escape discards a multiline comment", async () => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  await view.mockInput.typeText("First line")
  view.mockInput.pressEnter({ shift: true })
  await view.mockInput.typeText("Second line")
  view.mockInput.pressEscape()
  await view.wait()
  expect(view.draft()).toBe("Existing prompt")
})

test("keeps the multiline input and controls inside a short terminal", async () => {
  const view = await createHarness()
  view.resize(80, 14)
  await view.select("First step\nSecond step\nThird step\nFourth step\nFifth step\nSixth step")
  await view.open()
  const dialog = view.renderer.root.findDescendantById("plan-reviewer-dialog")!
  expect(dialog.screenY).toBeGreaterThanOrEqual(0)
  expect(dialog.screenY + dialog.height).toBeLessThanOrEqual(14)
  expect(view.commentInput().height).toBeGreaterThanOrEqual(2)
  expect(view.captureCharFrame()).toContain("Shift+Enter newline · Enter confirm")
  await view.comment(undefined)
})

test("quotes every selected line", async () => {
  const view = await createHarness()
  await view.select("First step\n\n  Next step")
  await view.open()
  await view.comment("Keep both steps")
  expect(view.draft()).toBe("> First step\n> \n>   Next step\n\nKeep both steps")
})

test("preserves selection across the leader shortcut", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("x", { ctrl: true })
  expect(view.renderer.getSelection()).toBeNull()
  expect(view.show).not.toHaveBeenCalled()
  view.mockInput.pressKey("p")
  view.transcript.content = "Updated while commenting"
  await view.flush()
  const preview = view.renderer.root.findDescendantById("plan-reviewer-selection-text") as TextRenderable
  expect(preview.plainText).toBe("Original plan")
  await view.comment("Keep the original context")
  expect(view.draft()).toBe("> Original plan\n\nKeep the original context")
})

test("preserves existing prompt text and attachments", async () => {
  const initial = "Review @notes.md"
  const view = await createHarness(initial)
  const attachment = { uri: "file:///project/notes.md" }
  const id = view.editor.extmarks.create({ start: 7, end: initial.length, virtual: true, metadata: attachment })
  const mark = { ...view.editor.extmarks.get(id) }
  view.editor.cursorOffset = 2
  await view.select()
  await view.open()
  view.editor.setSelection(0, 6)
  await view.comment("Revise this")
  expect(view.draft()).toBe("Review @notes.md\n\n> Original plan\n\nRevise this")
  expect(view.editor.extmarks.get(id)).toEqual(mark)
  expect(view.editor.extmarks.getMetadataFor(id)).toEqual(attachment)
  expect(view.editor.plainText).toBe(view.draft())
})

test("supports repeated comments", async () => {
  const view = await createHarness("Review notes")
  await view.select("First step")
  await view.open()
  expect((view.renderer.root.findDescendantById("plan-reviewer-selection-text") as TextRenderable).plainText).toBe("First step")
  await view.comment("Keep it")
  await view.select("Second step")
  await view.open()
  expect((view.renderer.root.findDescendantById("plan-reviewer-selection-text") as TextRenderable).plainText).toBe("Second step")
  await view.comment("Remove it")
  expect(view.draft()).toBe("Review notes\n\n> First step\n\nKeep it\n\n> Second step\n\nRemove it")
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test.each([undefined, "", "   ", "\n\t"])("leaves the draft unchanged when cancelled or blank (%s)", async comment => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  await view.comment(comment)
  expect(view.draft()).toBe("Existing prompt")
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("Escape cancels the comment dialog", async () => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  await view.mockInput.typeText("Discard this comment")
  view.mockInput.pressEscape()
  await view.wait()
  expect(view.draft()).toBe("Existing prompt")
})

test("requires a nonblank transcript selection", async () => {
  const view = await createHarness()
  await view.open()
  await view.select("   ")
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
  expect(view.toast).toHaveBeenCalledWith({ title: "Plan reviewer", message: "Select text in the session transcript", variant: "warning" })
  expect(view.draft()).toBe("")
})

test("ignores selections inside the prompt editor", async () => {
  const view = await createHarness("Existing prompt")
  view.renderer.startSelection(view.editor, view.editor.x, view.editor.y)
  view.renderer.updateSelection(view.editor, view.editor.x + 7, view.editor.y, { finishDragging: true })
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
  expect(view.draft()).toBe("Existing prompt")
})

test("does not reuse a selection after an unrelated key", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("a")
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
  expect(view.draft()).toBe("a")
})

test("does not reuse a selection after cancelling the leader shortcut", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("x", { ctrl: true })
  view.mockInput.pressEscape()
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
})

test("does not reuse a selection after the leader shortcut expires", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("x", { ctrl: true })
  view.expireLeader()
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
})

test("does not reuse a captured selection for programmatic commands", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("x", { ctrl: true })
  await view.command.run()
  expect(view.show).not.toHaveBeenCalled()
})

test("uses the most recent selection", async () => {
  const view = await createHarness()
  await view.select("Old text")
  view.mockInput.pressKey("x", { ctrl: true })
  await view.select("New text")
  view.mockInput.pressKey("p")
  await view.comment("Use this")
  expect(view.draft()).toBe("> New text\n\nUse this")
})

test("does not reuse a captured selection in another session", async () => {
  const view = await createHarness()
  await view.select()
  view.mockInput.pressKey("x", { ctrl: true })
  view.setRoute({ type: "session", sessionID: "session-b" })
  view.mockInput.pressKey("p")
  await view.wait()
  expect(view.show).not.toHaveBeenCalled()
})

test.each([{ type: "session", sessionID: "session-b" }, { type: "home" }] as const)(
  "does not append after leaving the original session (%j)", async route => {
    const view = await createHarness("Existing prompt")
    await view.select()
    await view.open()
    view.setRoute(route)
    await view.comment("Do not add this")
    expect(view.draft()).toBe("Existing prompt")
  },
)

test("does not open a dialog outside a session", async () => {
  const view = await createHarness()
  await view.select()
  view.setRoute({ type: "home" })
  await view.command.run()
  expect(view.show).not.toHaveBeenCalled()
})

test("does not handle comments in another input mode", async () => {
  const view = await createHarness()
  await view.select()
  view.setMode("panel")
  await view.command.run()
  expect(view.show).not.toHaveBeenCalled()
})

test("does not open another comment dialog while one is active", async () => {
  const view = await createHarness()
  await view.select()
  await view.open()
  await view.command.run()
  expect(view.show).toHaveBeenCalledTimes(1)
  await view.comment("One comment")
  expect(view.draft()).toBe("> Original plan\n\nOne comment")
})

test("appends to the session prompt when transcript selection removes focus", async () => {
  const view = await createHarness("Existing prompt")
  await view.select()
  view.editor.blur()
  expect(view.renderer.currentFocusedEditor).toBeNull()
  await view.open()
  expect(view.show).toHaveBeenCalledTimes(1)
  await view.comment("Revise this")
  expect(view.draft()).toBe("Existing prompt\n\n> Original plan\n\nRevise this")
  expect(view.toast).not.toHaveBeenCalled()
  expect(view.submit).not.toHaveBeenCalled()
  expect(view.send).not.toHaveBeenCalled()
})

test("appends to the session prompt instead of another focused input", async () => {
  const view = await createHarness("Existing prompt")
  const search = new InputRenderable(view.renderer, { id: "search", value: "Find this", width: 30, top: 8, position: "absolute" })
  view.renderer.root.add(search)
  search.focus()
  await view.select()
  await view.open()
  await view.comment("Revise this")
  expect(view.draft()).toBe("Existing prompt\n\n> Original plan\n\nRevise this")
  expect(search.value).toBe("Find this")
})

test("finds an unfocused prompt inside a session container", async () => {
  const view = await createHarness()
  const container = new BoxRenderable(view.renderer, { id: "session", width: "100%", height: "100%" })
  view.renderer.root.remove(view.editor)
  view.renderer.root.add(container)
  container.add(view.editor)
  view.editor.blur()
  await view.select()
  await view.open()
  await view.comment("Revise this")
  expect(view.draft()).toBe("> Original plan\n\nRevise this")
})

test("ignores hidden prompts from other sessions", async () => {
  const view = await createHarness("Existing prompt")
  const hidden = new BoxRenderable(view.renderer, { id: "other-session", width: "100%", height: "100%" })
  const other = new TextareaRenderable(view.renderer, {
    id: "other-prompt", initialValue: "Other session", width: 30, height: 2, top: 12, position: "absolute",
  })
  other.traits = { capture: ["tab"], ...{ owner: "opencode", role: "prompt" } }
  hidden.add(other)
  view.renderer.root.insertBefore(hidden, view.editor)
  await view.flush()
  hidden.visible = false
  view.editor.blur()
  await view.select()
  await view.open()
  await view.comment("Revise this")
  expect(view.draft()).toBe("Existing prompt\n\n> Original plan\n\nRevise this")
  expect(other.plainText).toBe("Other session")
})

test("ignores selections inside an unfocused prompt editor", async () => {
  const view = await createHarness("Existing prompt")
  view.renderer.startSelection(view.editor, view.editor.x, view.editor.y)
  view.renderer.updateSelection(view.editor, view.editor.x + 7, view.editor.y, { finishDragging: true })
  view.editor.blur()
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
  expect(view.draft()).toBe("Existing prompt")
  expect(view.toast).toHaveBeenCalledWith({ title: "Plan reviewer", message: "Select text in the session transcript", variant: "warning" })
})

test.each(["removed", "hidden"])("requires an available prompt editor when it is %s", async state => {
  const view = await createHarness()
  await view.select()
  if (state === "removed") view.editor.destroy()
  else {
    view.editor.visible = false
    view.editor.blur()
  }
  await view.open()
  expect(view.show).not.toHaveBeenCalled()
  expect(view.toast).toHaveBeenCalledWith({ title: "Plan reviewer", message: "The session prompt is not available", variant: "warning" })
})

test.each(["destroyed", "detached", "hidden"])("does not append when the prompt becomes %s", async state => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  if (state === "destroyed") view.editor.destroy()
  else if (state === "detached") view.renderer.root.remove(view.editor)
  else view.editor.visible = false
  await view.comment("Do not add this")
  expect(view.draft()).toBe("Existing prompt")
})

test("unloading removes the selection listener and cancels pending comments", async () => {
  const view = await createHarness("Existing prompt")
  await view.select()
  await view.open()
  const listeners = view.renderer.keyInput.listenerCount("keypress")
  view.stop()
  await view.wait()
  expect(view.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 1)
  expect(view.draft()).toBe("Existing prompt")
  await view.select()
  await view.command.run()
  expect(view.show).toHaveBeenCalledTimes(1)
})
