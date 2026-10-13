import { Plugin } from "@opencode/plugin/tui"
import { execFile } from "node:child_process"

const script = `on run argv
  tell application "Ghostty"
    set cfg to new surface configuration
    set initial working directory of cfg to item 1 of argv
    new tab in front window with configuration cfg
  end tell
end run`

export default Plugin.define({
  id: "local.open-ghostty-tab.tui",
  setup(context) {
    const directory = () => {
      const route = context.ui.router.current()
      if (route?.type === "session") {
        const dir = context.data.session.get(route.sessionID)?.location?.directory
        if (dir) return dir
      }
      return (context.location ?? context.data.location.default())?.directory
    }

    const open = () => {
      if (process.env.TERM_PROGRAM !== "ghostty") {
        context.ui.toast.show({ message: "Not running in Ghostty", variant: "error" })
        return
      }
      const dir = directory()
      if (!dir) {
        context.ui.toast.show({ message: "No directory to open", variant: "error" })
        return
      }
      execFile("osascript", ["-e", script, dir], (error, _stdout, stderr) => {
        if (error) {
          context.ui.toast.show({ title: "Ghostty", message: stderr.trim() || error.message, variant: "error" })
        }
      })
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "local.open-ghostty-tab.open",
          title: "Open Ghostty tab here",
          group: "Ghostty",
          bind: "<leader>/",
          palette: true,
          slash: { name: "open-ghostty-tab" },
          run: open,
        },
      ],
    }))
  },
})
