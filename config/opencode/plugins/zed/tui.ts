import { Plugin } from "@opencode/plugin/tui"
import { spawn } from "node:child_process"

export default Plugin.define({
  id: "local.zed.tui",
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
      const dir = directory()
      if (!dir) {
        context.ui.toast.show({ message: "No directory to open", variant: "error" })
        return
      }
      const child = spawn("zed", ["--classic", dir], { detached: true, stdio: "ignore" })
      child.on("error", (error) => {
        context.ui.toast.show({ title: "Zed", message: error.message, variant: "error" })
      })
      child.on("exit", (code) => {
        if (code === 0) {
          context.ui.toast.show({ message: `Opened in Zed: ${context.ui.format.path(dir)}`, variant: "success" })
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
  },
})
