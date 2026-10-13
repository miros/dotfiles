import { expect, mock, test } from "bun:test"
import type { SessionInfo, SessionPromptInput, SessionSwitchAgentInput, SessionUpdateInput } from "@opencode/client"
import { startQuickFork, type QuickForkClient } from "./quick-fork"

function createHarness() {
  const nativeFork: SessionInfo = {
    id: "ses_qf", projectID: "project-source", location: { directory: "/project/packages/app" },
    fork: { sessionID: "ses_source", boundary: { type: "through", messageID: "msg_last" } },
    agent: "build", model: { providerID: "openai", id: "example", variant: "high" },
    title: "Original (fork #1)", permissions: [{ action: "edit", resource: "*", effect: "deny" }],
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1, updated: 1 },
  }
  const original = structuredClone(nativeFork)
  const fork = mock(async (_input: { sessionID: string }) => nativeFork)
  const update = mock(async (_input: SessionUpdateInput) => {})
  const switchAgent = mock(async (_input: SessionSwitchAgentInput) => {})
  const prompt = mock(async (_input: SessionPromptInput) => ({}))
  const onCreated = mock((_session: SessionInfo): void | Promise<void> => {})
  const client = { session: { fork, update, switchAgent, prompt } } as unknown as QuickForkClient
  return { client, nativeFork, original, fork, update, switchAgent, prompt, onCreated }
}

test("preserves inherited context and model while selecting Plan", async () => {
  const view = createHarness()
  const created = await startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)
  expect(view.fork).toHaveBeenCalledWith({ sessionID: "ses_source" })
  expect(view.update).toHaveBeenCalledWith({ sessionID: "ses_qf", title: "QF: Explain this" })
  expect(created.fork).toEqual(view.nativeFork.fork)
  expect(created.model).toEqual(view.nativeFork.model)
  expect(created.agent).toBe("plan")
  expect(created.permissions).toEqual(view.nativeFork.permissions)
  expect(created.location).toEqual(view.nativeFork.location)
  expect(view.nativeFork).toEqual(view.original)
})

test("selects Plan on the fork before opening it or submitting the question", async () => {
  const view = createHarness()
  await startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)
  expect(view.switchAgent).toHaveBeenCalledWith({ sessionID: "ses_qf", agent: "plan" })
  expect(view.switchAgent.mock.invocationCallOrder[0]).toBeLessThan(view.onCreated.mock.invocationCallOrder[0])
  expect(view.switchAgent.mock.invocationCallOrder[0]).toBeLessThan(view.prompt.mock.invocationCallOrder[0])
  expect(view.onCreated).toHaveBeenCalledWith(expect.objectContaining({ agent: "plan" }))
  expect(view.nativeFork.agent).toBe("build")
})

test("renames and opens the fork before prompt admission finishes", async () => {
  const view = createHarness()
  const admission = Promise.withResolvers<{}>()
  view.prompt.mockImplementation(() => admission.promise)
  const running = startQuickFork(view.client, "ses_source", "Explain the failure", view.onCreated)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "ses_qf", title: "QF: Explain the failure" }))
  expect(view.update.mock.invocationCallOrder[0]).toBeLessThan(view.onCreated.mock.invocationCallOrder[0])
  expect(view.onCreated.mock.invocationCallOrder[0]).toBeLessThan(view.prompt.mock.invocationCallOrder[0])
  admission.resolve({})
  await running
})

test("waits for fork hydration before submitting the side question", async () => {
  const view = createHarness()
  const hydration = Promise.withResolvers<void>()
  view.onCreated.mockImplementation(() => hydration.promise)
  const running = startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.onCreated).toHaveBeenCalledTimes(1)
  expect(view.prompt).not.toHaveBeenCalled()
  hydration.resolve()
  await running
  expect(view.prompt).toHaveBeenCalledTimes(1)
})

test("submits only the user's question to the fork", async () => {
  const view = createHarness()
  await startQuickFork(view.client, "ses_source", "  Why did\nthe test fail?  ", view.onCreated)
  const input = view.prompt.mock.calls[0][0]
  expect(input).toEqual({ sessionID: "ses_qf", text: "Why did\nthe test fail?" })
  expect(view.update.mock.calls[0][0]).toEqual({ sessionID: "ses_qf", title: "QF: Why did the test fail?" })
})

test("shortens the title without shortening the side question", async () => {
  const view = createHarness()
  const question = "Explain the earlier database failure. ".repeat(5).trim()
  const created = await startQuickFork(view.client, "ses_source", question, view.onCreated)
  expect(created.title!.length).toBeLessThanOrEqual(80)
  expect(created.title).toStartWith("QF: Explain the earlier database failure")
  expect(created.title).toEndWith("…")
  expect(view.prompt.mock.calls[0][0].text).toBe(question)
})

test("uses the assigned number without changing the user's prompt", async () => {
  const view = createHarness()
  const created = await startQuickFork(view.client, "ses_source", "Explain this", view.onCreated, 3)
  expect(created.title).toBe("QF3: Explain this")
  expect(view.update).toHaveBeenCalledWith({ sessionID: "ses_qf", title: "QF3: Explain this" })
  expect(view.prompt).toHaveBeenCalledWith({ sessionID: "ses_qf", text: "Explain this" })
})

test("keeps numbered titles within the title limit", async () => {
  const view = createHarness()
  const question = "Explain the database failure. ".repeat(6).trim()
  const created = await startQuickFork(view.client, "ses_source", question, view.onCreated, 123)
  expect(created.title!.length).toBeLessThanOrEqual(80)
  expect(created.title).toStartWith("QF123: Explain the database failure")
  expect(created.title).toEndWith("…")
  expect(view.prompt.mock.calls[0][0].text).toBe(question)
})

test("does not rename or submit a question when forking fails", async () => {
  const view = createHarness()
  view.fork.mockImplementation(async () => { throw new Error("Fork failed") })
  await expect(startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)).rejects.toThrow("Fork failed")
  expect(view.update).not.toHaveBeenCalled()
  expect(view.onCreated).not.toHaveBeenCalled()
  expect(view.prompt).not.toHaveBeenCalled()
})

test("does not open or prompt a fork whose rename failed", async () => {
  const view = createHarness()
  view.update.mockImplementation(async () => { throw new Error("Rename failed") })
  await expect(startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)).rejects.toThrow("Rename failed")
  expect(view.onCreated).not.toHaveBeenCalled()
  expect(view.prompt).not.toHaveBeenCalled()
})

test("does not open or prompt a fork when agent selection fails", async () => {
  const view = createHarness()
  view.switchAgent.mockImplementation(async () => { throw new Error("Agent unavailable") })
  await expect(startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)).rejects.toThrow("Agent unavailable")
  expect(view.onCreated).not.toHaveBeenCalled()
  expect(view.prompt).not.toHaveBeenCalled()
})

test("keeps the opened fork when prompt admission fails", async () => {
  const view = createHarness()
  view.prompt.mockImplementation(async () => { throw new Error("Admission failed") })
  await expect(startQuickFork(view.client, "ses_source", "Explain this", view.onCreated)).rejects.toThrow("Admission failed")
  expect(view.onCreated).toHaveBeenCalledTimes(1)
})

test("does not call the API for a blank question", async () => {
  const view = createHarness()
  await expect(startQuickFork(view.client, "ses_source", "\n ", view.onCreated)).rejects.toThrow("Question is required")
  expect(view.fork).not.toHaveBeenCalled()
  expect(view.prompt).not.toHaveBeenCalled()
})
