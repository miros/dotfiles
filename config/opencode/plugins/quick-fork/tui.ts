import { Plugin } from "@opencode/plugin/tui"
import { startQuickFork } from "./quick-fork"

export default Plugin.define({
  id: "local.quick-fork.tui",
  setup(context) {
    let active = true
    const pendingNumbers = new Set<number>()

    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "local.quick-fork.open",
        title: "Quick fork",
        description: "Fork this conversation and ask a side question in a background tab",
        group: "Session",
        palette: true,
        slash: { name: "qf", arguments: true },
        async run(input) {
          const route = context.ui.router.current()
          if (route.type !== "session") {
            await context.ui.dialog.alert({ title: "/qf", message: "Open a session first" })
            return
          }
          const question = input?.trim() || (await context.ui.dialog.prompt({ title: "/qf", placeholder: "Ask anything" }))?.trim()
          if (!question || !active) return
          let highest = Math.max(0, ...pendingNumbers)
          for (const tab of context.ui.tabs.enabled() ? context.ui.tabs.list() : []) {
            const match = /^QF(\d+)?:/.exec(tab.title ?? "")
            if (!match) continue
            const number = Number(match[1] ?? 1)
            if (Number.isSafeInteger(number) && number > highest) highest = number
          }
          const number = highest + 1
          pendingNumbers.add(number)
          try {
            await startQuickFork(context.client, route.sessionID, question, async created => {
              if (!active) return
              context.data.session.invalidate(created.id)
              await context.data.session.sync(created.id)
              if (!active) return
              if (context.ui.tabs.enabled()) context.ui.tabs.open(created.id)
              context.data.session.message.invalidate(created.id)
              await context.data.session.message.sync(created.id)
            }, number)
          } catch (error) {
            if (active) await context.ui.dialog.alert({
              title: "/qf failed",
              message: error instanceof Error ? error.message : String(error),
            })
          } finally {
            pendingNumbers.delete(number)
          }
        },
      }],
    }))

    return () => {
      active = false
    }
  },
})
