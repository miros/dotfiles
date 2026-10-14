import { Plugin } from "@opencode/plugin/tui"
import type { KeymapCommand } from "@opencode/plugin/tui/context"
import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

export default Plugin.define({
  id: "local.zed.tui",
  setup(context) {
    const selection = () => {
      const route = context.ui.router.current()
      if (route?.type !== "session") return
      const selected = context.renderer.getSelection()
      const editor = context.renderer.currentFocusedEditor
      if (!selected || (editor && selected.selectedRenderables.includes(editor))) return
      const text = selected.getSelectedText().trim()
      if (text) return { text, sessionID: route.sessionID }
    }
    let captured: ReturnType<typeof selection>
    const captureSelection = () => {
      if (context.renderer.getSelection() || context.keymap.pending().length === 0) captured = selection()
    }
    context.renderer.keyInput.prependListener("keypress", captureSelection)

    const directory = () => {
      const route = context.ui.router.current()
      if (route?.type === "session") {
        const dir = context.data.session.get(route.sessionID)?.location?.directory
        if (dir) return dir
      }
      return (context.location ?? context.data.location.default())?.directory
    }

    const open: KeymapCommand["run"] = async (_input, event) => {
      const route = context.ui.router.current()
      const selected = selection() ?? (event && route?.type === "session" && captured?.sessionID === route.sessionID
        ? captured : undefined)
      captured = undefined
      const dir = directory()
      if (!dir) {
        context.ui.toast.show({ message: "No directory to open", variant: "error" })
        return
      }
      let target = dir
      if (selected) {
        const existingFile = async (path: string) => {
          if (!path || /[\r\n]/.test(path)) return
          const file = resolve(dir, path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path)
          try {
            if ((await stat(file)).isFile()) return file
          } catch {
            return
          }
        }
        const wrappers = [
          ["**", "**"], ["__", "__"], ["*", "*"], ["_", "_"],
          ["`", "`"], ['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"],
          ["(", ")"], ["[", "]"], ["{", "}"], ["<", ">"],
        ] as const
        let path = selected.text
        let selectedTarget: string | undefined
        while (path) {
          selectedTarget = await existingFile(path)
          if (selectedTarget) break
          const position = path.match(/:(\d+)(?::\d+|[-–]\d+)?$/)
          if (position && Number(position[1]) >= 1) {
            const file = await existingFile(path.slice(0, -position[0].length))
            if (file) {
              selectedTarget = `${file}:${position[1]}`
              break
            }
          }
          const wrapper = wrappers.find(([start, end]) =>
            path.length >= start.length + end.length && path.startsWith(start) && path.endsWith(end))
          if (wrapper) path = path.slice(wrapper[0].length, -wrapper[1].length)
          else if (/[,:.;!?…)\]}>`"'”’]$/.test(path)) path = path.slice(0, -1)
          else if (/^[`"'“‘]/.test(path)) path = path.slice(1)
          else break
        }
        if (!selectedTarget) {
          context.ui.toast.show({ title: "Zed", message: "Select an existing file path", variant: "error" })
          return
        }
        target = selectedTarget
      }
      const args = selected ? ["--classic", dir, target] : ["--classic", dir]
      const child = spawn("zed", args, { detached: true, stdio: "ignore" })
      child.on("error", (error) => {
        context.ui.toast.show({ title: "Zed", message: error.message, variant: "error" })
      })
      child.on("exit", (code) => {
        if (code === 0) {
          context.ui.toast.show({ message: `Opened in Zed: ${context.ui.format.path(target)}`, variant: "success" })
        } else {
          context.ui.toast.show({ title: "Zed", message: `zed exited with code ${code}`, variant: "error" })
        }
      })
      child.unref()
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "local.zed.open",
          title: "Open in Zed",
          group: "Zed",
          bind: "<leader>z",
          palette: true,
          slash: { name: "zed" },
          run: open,
        },
      ],
      bindings: ["local.zed.open"],
    }))
    return () => {
      context.renderer.keyInput.off("keypress", captureSelection)
    }
  },
})
