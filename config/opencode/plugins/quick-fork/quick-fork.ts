import type { OpenCodeClient, SessionInfo } from "@opencode/client"

export type QuickForkClient = {
  session: Pick<OpenCodeClient["session"], "fork" | "update" | "switchAgent" | "prompt">
}

export async function startQuickFork(
  client: QuickForkClient,
  sessionID: string,
  input: string,
  onCreated: (session: SessionInfo) => void | Promise<void>,
  number = 1,
) {
  const question = input.trim()
  if (!question) throw new Error("Question is required")
  const label = question.replace(/\s+/g, " ")
  const prefix = number === 1 ? "QF" : `QF${number}`
  const limit = Math.min(75, 80 - prefix.length - 2)
  const title = `${prefix}: ${label.length > limit ? `${label.slice(0, limit - 1)}…` : label}`
  const fork = await client.session.fork({ sessionID })
  await client.session.update({ sessionID: fork.id, title })
  await client.session.switchAgent({ sessionID: fork.id, agent: "plan" })
  const created = { ...fork, title, agent: "plan" }
  await onCreated(created)
  await client.session.prompt({ sessionID: created.id, text: question })
  return created
}
