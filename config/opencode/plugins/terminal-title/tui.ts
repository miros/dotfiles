import { Plugin } from "@opencode/plugin/tui"
import { basename, dirname, join } from "node:path"
import { createEffect } from "solid-js"

export default Plugin.define({
  id: "local.terminal-title.tui",
  setup(context) {
    return context.ui.slot({
      append: "app",
      render: () => {
        let previous: string | undefined

        createEffect(() => {
          const route = context.ui.router.current()
          const session = route?.type === "session" ? context.data.session.get(route.sessionID) : undefined
          const directory = session?.location?.directory
            ?? context.location?.directory
            ?? context.data.location.default()?.directory
          if (!directory) return

          const folder = basename(directory)
          const parent = basename(dirname(directory)) || "/"
          const title = join(parent, folder).replace(/[\x00-\x1f\x7f-\x9f]/g, "")
          if (!title || title === previous) return

          context.renderer.setTerminalTitle(`OC ${title}`)
          previous = title
        })

        return null
      },
    })
  },
})
