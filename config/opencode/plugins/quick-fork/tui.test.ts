import { expect, mock, test } from "bun:test"
import type { SessionInfo, SessionPromptInput, SessionSwitchAgentInput, SessionUpdateInput } from "@opencode/client"
import type { Plugin } from "@opencode/plugin/tui"
import plugin from "./tui"

type Command = { id: string; slash: { name: string; arguments: boolean }; run(input?: string): Promise<void> }

function createHarness(options: {
  question?: string
  tabs?: boolean
  openTitles?: Array<string | undefined>
  prompt?: (input: SessionPromptInput) => Promise<unknown>
  syncMessages?: (sessionID: string) => Promise<void>
} = {}) {
  let route: { type: "session"; sessionID: string } | { type: "home" } = { type: "session", sessionID: "ses_source" }
  let command: Command
  let count = 0
  const titles = new Map<string, string>()
  const tabs = (options.openTitles ?? []).map((title, index) => ({ sessionID: `ses_existing_${index}`, title }))
  const fork = mock(async ({ sessionID }: { sessionID: string }) => ({
    id: `ses_qf_${++count}`, fork: { sessionID, boundary: { type: "through", messageID: "msg_last" } },
    location: { directory: "/project" },
  } as SessionInfo))
  const update = mock(async (input: SessionUpdateInput) => {
    if (input.title !== undefined) titles.set(input.sessionID, input.title)
  })
  const switchAgent = mock(async (_input: SessionSwitchAgentInput) => {})
  const prompt = mock(options.prompt ?? (async () => ({})))
  const open = mock((sessionID: string) => {
    tabs.push({ sessionID, title: titles.get(sessionID) })
    return true
  })
  const list = mock(() => tabs)
  const focus = mock(() => true)
  const navigate = mock(() => {})
  const question = mock(async () => options.question)
  const alert = mock(async () => {})
  const toast = mock(() => {})
  const slot = mock(() => {})
  const invalidate = mock(() => {})
  const sync = mock(async (_sessionID: string) => {})
  const invalidateMessages = mock(() => {})
  const syncMessages = mock(options.syncMessages ?? (async (_sessionID: string) => {}))
  const context = {
    client: { session: { fork, update, switchAgent, prompt } },
    data: { session: { invalidate, sync, message: { invalidate: invalidateMessages, sync: syncMessages } } },
    keymap: { layer: (factory: () => { commands: Command[] }) => { command = factory().commands[0] } },
    ui: {
      slot, router: { current: () => route, navigate }, tabs: { enabled: () => options.tabs ?? true, open, focus, list },
      dialog: { prompt: question, alert }, toast: { show: toast },
    },
  } as unknown as Plugin.Context
  const stop = plugin.setup(context) as () => void
  return { command: command!, fork, update, switchAgent, prompt, open, focus, navigate, question, alert, toast, slot, list,
    invalidate, sync, invalidateMessages, syncMessages, stop, setRoute(next: typeof route) { route = next },
    closeTab(sessionID: string) {
      const index = tabs.findIndex(tab => tab.sessionID === sessionID)
      if (index !== -1) tabs.splice(index, 1)
    },
  }
}

test("registers qf without overriding the standard btw command", () => {
  const view = createHarness()
  expect(view.command.slash).toEqual({ name: "qf", arguments: true })
  expect(view.command.id).not.toBe("session.aside")
  expect(plugin.id).not.toBe("opencode.btw")
})

test("switches the fork to Plan before opening its background tab", async () => {
  const view = createHarness()
  await view.command.run("Explain this")
  expect(view.switchAgent).toHaveBeenCalledWith({ sessionID: "ses_qf_1", agent: "plan" })
  expect(view.switchAgent.mock.invocationCallOrder[0]).toBeLessThan(view.sync.mock.invocationCallOrder[0])
  expect(view.switchAgent.mock.invocationCallOrder[0]).toBeLessThan(view.open.mock.invocationCallOrder[0])
  expect(view.focus).not.toHaveBeenCalled()
})

test("opens a background fork before prompt admission finishes", async () => {
  const delayed = Promise.withResolvers<{}>()
  const view = createHarness({ prompt: () => delayed.promise })
  const running = view.command.run("Explain this")
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.open).toHaveBeenCalledWith("ses_qf_1")
  expect(view.focus).not.toHaveBeenCalled()
  expect(view.navigate).not.toHaveBeenCalled()
  expect(view.slot).not.toHaveBeenCalled()
  expect(view.toast).not.toHaveBeenCalled()
  delayed.resolve({})
  await running
  expect(view.toast).not.toHaveBeenCalled()
})

test("loads copied history before sending the side question", async () => {
  const copiedHistory = Promise.withResolvers<void>()
  const view = createHarness({ syncMessages: () => copiedHistory.promise })
  const running = view.command.run("Explain this")
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.open).toHaveBeenCalledWith("ses_qf_1")
  expect(view.invalidateMessages).toHaveBeenCalledWith("ses_qf_1")
  expect(view.syncMessages).toHaveBeenCalledWith("ses_qf_1")
  expect(view.prompt).not.toHaveBeenCalled()
  copiedHistory.resolve()
  await running
  expect(view.prompt).toHaveBeenCalledTimes(1)
})

test("submits a side question without a footer loader or completion notification", async () => {
  const view = createHarness()
  await view.command.run("Explain this")
  expect(view.prompt).toHaveBeenCalledWith({ sessionID: "ses_qf_1", text: "Explain this" })
  expect(view.invalidate).toHaveBeenCalledWith("ses_qf_1")
  expect(view.sync).toHaveBeenCalledWith("ses_qf_1")
  expect(view.slot).not.toHaveBeenCalled()
  expect(view.toast).not.toHaveBeenCalled()
  expect(view.alert).not.toHaveBeenCalled()
})

test.each([
  { openTitles: [], title: "QF: Explain this" },
  { openTitles: ["QF: Earlier question"], title: "QF2: Explain this" },
  { openTitles: ["QF: First", "QF2: Second"], title: "QF3: Explain this" },
  { openTitles: ["QF2: Second", "QF4: Fourth"], title: "QF5: Explain this" },
  { openTitles: ["QF9: Ninth", "QF12: Twelfth"], title: "QF13: Explain this" },
  { openTitles: [undefined, "Original", "BTW: Earlier question", "QFoo: Other", "QF 2: Other"], title: "QF: Explain this" },
])("numbers new forks from the highest open QF tab ($title)", async ({ openTitles, title }) => {
  const view = createHarness({ openTitles })
  await view.command.run("Explain this")
  expect(view.update).toHaveBeenCalledWith({ sessionID: "ses_qf_1", title })
})

test("increments the title for sequentially opened forks", async () => {
  const view = createHarness()
  await view.command.run("First question")
  await view.command.run("Second question")
  await view.command.run("Third question")
  expect(view.update.mock.calls.map(([input]) => input.title)).toEqual([
    "QF: First question", "QF2: Second question", "QF3: Third question",
  ])
})

test("ignores closed forks when assigning the next title", async () => {
  const view = createHarness()
  await view.command.run("First question")
  await view.command.run("Second question")
  view.closeTab("ses_qf_2")
  await view.command.run("Another question")
  expect(view.update.mock.calls[2][0].title).toBe("QF2: Another question")
  view.closeTab("ses_qf_1")
  view.closeTab("ses_qf_3")
  await view.command.run("Fresh question")
  expect(view.update.mock.calls[3][0].title).toBe("QF: Fresh question")
})

test("reserves distinct numbers before concurrent forks become visible", async () => {
  const view = createHarness({ openTitles: ["QF: Existing question"] })
  const firstFork = Promise.withResolvers<SessionInfo>()
  view.fork.mockImplementationOnce(() => firstFork.promise)
  const first = view.command.run("First question")
  await view.command.run("Second question")
  expect(view.update.mock.calls[0][0].title).toBe("QF3: Second question")
  firstFork.resolve({ id: "ses_delayed_qf", location: { directory: "/project" } } as SessionInfo)
  await first
  expect(view.update.mock.calls[1][0].title).toBe("QF2: First question")
})

test("releases a pending number when fork creation fails", async () => {
  const view = createHarness({ openTitles: ["QF: Existing question"] })
  view.fork.mockImplementationOnce(async () => { throw new Error("Fork failed") })
  await view.command.run("Failed question")
  await view.command.run("Next question")
  expect(view.update.mock.calls[0][0].title).toBe("QF2: Next question")
})

test("keeps an opened fork's number occupied when prompt admission fails", async () => {
  const view = createHarness()
  view.prompt.mockImplementationOnce(async () => { throw new Error("Admission failed") })
  await view.command.run("Failed question")
  await view.command.run("Next question")
  expect(view.update.mock.calls.map(([input]) => input.title)).toEqual(["QF: Failed question", "QF2: Next question"])
})

test("asks for the question when command arguments are missing", async () => {
  const view = createHarness({ question: "  Explain this  " })
  await view.command.run()
  expect(view.question).toHaveBeenCalledWith({ title: "/qf", placeholder: "Ask anything" })
  expect(view.prompt.mock.calls[0][0].text).toBe("Explain this")
})

test.each([undefined, "   "])("cancelled or blank input creates no fork (%s)", async question => {
  const view = createHarness({ question })
  await view.command.run()
  expect(view.fork).not.toHaveBeenCalled()
  expect(view.open).not.toHaveBeenCalled()
})

test("requires an open source session", async () => {
  const view = createHarness()
  view.setRoute({ type: "home" })
  await view.command.run("Explain this")
  expect(view.fork).not.toHaveBeenCalled()
  expect(view.alert).toHaveBeenCalledWith({ title: "/qf", message: "Open a session first" })
  expect(view.toast).not.toHaveBeenCalled()
})

test("starts the fork without navigation when tabs are disabled", async () => {
  const view = createHarness({ tabs: false })
  await view.command.run("Explain this")
  expect(view.fork).toHaveBeenCalledTimes(1)
  expect(view.prompt).toHaveBeenCalledTimes(1)
  expect(view.open).not.toHaveBeenCalled()
  expect(view.navigate).not.toHaveBeenCalled()
})

test("forks each concurrent question from its own source", async () => {
  const view = createHarness()
  const first = view.command.run("First question")
  view.setRoute({ type: "session", sessionID: "ses_other" })
  await Promise.all([first, view.command.run("Second question")])
  expect(view.fork.mock.calls.map(([input]) => input.sessionID)).toEqual(["ses_source", "ses_other"])
  expect(view.open).toHaveBeenCalledTimes(2)
  expect(view.focus).not.toHaveBeenCalled()
})

test("shows admission errors in a dialog instead of a notification", async () => {
  const view = createHarness({ prompt: async () => { throw new Error("Admission failed") } })
  await view.command.run("Explain this")
  expect(view.open).toHaveBeenCalledWith("ses_qf_1")
  expect(view.alert).toHaveBeenCalledWith({ title: "/qf failed", message: "Admission failed" })
  expect(view.toast).not.toHaveBeenCalled()
})
