import { Plugin } from "@opencode/plugin/tui"
import { isEditBufferRenderable, type EditBufferRenderable, type Renderable } from "@opentui/core"
import { promptComment } from "./comment-dialog"

function findPrompt(renderable: Renderable): EditBufferRenderable | undefined {
  if (!renderable.visible || renderable.isDestroyed) return
  if (isEditBufferRenderable(renderable)) {
    const traits: typeof renderable.traits & { owner?: string; role?: string } = renderable.traits
    if (traits.owner === "opencode" && traits.role === "prompt") return renderable
  }
  for (const child of renderable.getChildren()) {
    const editor = findPrompt(child)
    if (editor) return editor
  }
}

export default Plugin.define({
  id: "local.plan-reviewer.tui",
  setup(context) {
    let active = true
    let showing = false

    const selection = () => {
      const route = context.ui.router.current()
      if (route.type !== "session" || context.keymap.mode.current() !== "base" || showing) return
      const selected = context.renderer.getSelection()
      if (!selected || selected.selectedRenderables.some(isEditBufferRenderable)) return
      const editor = findPrompt(context.renderer.root)
      const text = selected.getSelectedText()
      if (text.trim()) return { text, sessionID: route.sessionID, editor }
    }
    let captured: ReturnType<typeof selection>
    const captureSelection = () => {
      if (context.renderer.getSelection() || context.keymap.pending().length === 0) captured = selection()
    }
    context.renderer.keyInput.prependListener("keypress", captureSelection)

    context.keymap.layer(() => ({
      mode: "base",
      commands: [{
        id: "local.plan-reviewer.comment",
        title: "Comment on selected text",
        group: "Plan reviewer",
        bind: "<leader>p",
        enabled: () => context.ui.router.current().type === "session",
        async run(_input, event) {
          if (!active || showing || context.keymap.mode.current() !== "base") return
          const route = context.ui.router.current()
          const selected = selection() ?? (event && route.type === "session" && captured?.sessionID === route.sessionID
            ? captured : undefined)
          captured = undefined
          if (route.type !== "session") return
          if (!selected) {
            context.ui.toast.show({ title: "Plan reviewer", message: "Select text in the session transcript", variant: "warning" })
            return
          }
          const editor = selected.editor
          if (!editor || editor.isDestroyed) {
            context.ui.toast.show({ title: "Plan reviewer", message: "The session prompt is not available", variant: "warning" })
            return
          }

          showing = true
          try {
            const comment = await promptComment(context, selected.text)
            if (!active || !comment?.trim()) return
            const current = context.ui.router.current()
            if (current.type !== "session" || current.sessionID !== selected.sessionID || editor.isDestroyed
              || findPrompt(context.renderer.root) !== editor) return
            const quote = selected.text.replace(/\r\n?/g, "\n").split("\n").map(line => `> ${line}`).join("\n")
            const separator = editor.plainText ? "\n\n" : ""
            editor.clearSelection()
            editor.gotoBufferEnd()
            editor.insertText(`${separator}${quote}\n\n${comment}`)
            editor.focus()
          } finally {
            showing = false
          }
        },
      }],
      bindings: ["local.plan-reviewer.comment"],
    }))

    return () => {
      active = false
      captured = undefined
      context.renderer.keyInput.off("keypress", captureSelection)
      if (showing) context.ui.dialog.clear()
    }
  },
})
