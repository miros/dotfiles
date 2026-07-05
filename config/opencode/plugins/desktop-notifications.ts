import type { Plugin } from "@opencode-ai/plugin"

export const DesktopNotifications: Plugin = async ({ $, client }) => {
  let opencodeTty = ""
  try {
    const out = await $`tty`.text()
    opencodeTty = out.trim()
    if (opencodeTty === "not a tty") opencodeTty = ""
  } catch {
    opencodeTty = ""
  }

  const isOpencodeVisible = async (): Promise<boolean> => {
    if (!opencodeTty) return false
    const script =
      'if application "iTerm2" is not running then return "no"\n' +
      'tell application "System Events"\n' +
      '  set frontApp to name of first application process whose frontmost is true\n' +
      'end tell\n' +
      'if frontApp is not "iTerm2" then return "no"\n' +
      'tell application id "com.googlecode.iterm2"\n' +
      '  if (count of windows) is 0 then return "no"\n' +
      '  return tty of current session of current window\n' +
      'end tell'
    try {
      const result = (await $`osascript -e ${script}`.text()).trim()
      if (result === "no" || !result) return false
      return result === opencodeTty
    } catch {
      return false
    }
  }

  const truncate = (s: string, max = 200): string =>
    s.length > max ? s.slice(0, max - 1) + "…" : s

  const notify = async (message: string) => {
    if (await isOpencodeVisible()) return
    const body = truncate(message)
    await $`osascript -e ${`display notification "${body}" with title "Opencode"`}`
  }

  const sessionTitle = async (sessionID: string): Promise<string> => {
    try {
      const res = await client.session.get({ path: { id: sessionID } })
      return res.data?.title ?? ""
    } catch {
      return ""
    }
  }

  const errorMessage = (event: Extract<import("@opencode-ai/sdk").Event, { type: "session.error" }>): string =>
    event.properties.error?.name ?? "Session error"

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const title = await sessionTitle(event.properties.sessionID)
        await notify(title ? `Finished: ${title}` : "Request finished")
      }

      if (event.type === "permission.updated") {
        const title = event.properties.title
        await notify(title ? `Attention: ${title}` : "Attention required")
      }

      if (event.type === "session.error") {
        await notify(errorMessage(event))
      }
    },
  }
}