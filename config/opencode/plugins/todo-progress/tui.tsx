import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, onCleanup, Show } from "solid-js"

type Todo = {
  status: "pending" | "in_progress" | "completed" | "cancelled"
}

type Message = {
  id: string
  type: string
  content?: ReadonlyArray<{
    type: string
    name?: string
    state?: { status?: string; input?: { todos?: unknown } }
  }>
}

function latestTodos(messages: readonly Message[], revertMessageID?: string): Todo[] {
  const revertIndex = revertMessageID ? messages.findIndex(message => message.id === revertMessageID) : -1
  const call = messages
    .slice(0, revertIndex === -1 ? messages.length : revertIndex)
    .flatMap(message => message.type === "assistant" ? message.content ?? [] : [])
    .findLast(part => part.type === "tool" && part.name === "todowrite" && part.state?.status === "completed")
  const todos = call?.state?.input?.todos
  return Array.isArray(todos) ? todos : []
}

function formatProgress(todos: readonly Todo[]) {
  const active = todos.filter(todo => todo.status !== "cancelled")
  if (active.length === 0) return "todo:[]"
  const completed = active.filter(todo => todo.status === "completed").length
  return `todo:${completed}/${active.length}`
}

function TodoProgress(props: {
  context: Plugin.Context
  sessionID?: string
  openSidebar: () => void
}) {
  let pressedSessionID: string | undefined

  createEffect(() => {
    void props.sessionID
    pressedSessionID = undefined
  })

  const label = createMemo(() => {
    const sessionID = props.sessionID
    if (!sessionID) return undefined
    const session = props.context.data.session
    const messages = session.message.list(sessionID) as unknown as Message[]
    return formatProgress(latestTodos(messages, session.get(sessionID)?.revert?.messageID))
  })

  return (
    <Show when={label()}>
      <text
        fg={props.context.theme.text.muted}
        selectable={false}
        onMouseDown={event => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.preventDefault()
          pressedSessionID = props.sessionID
        }}
        onMouseUp={event => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.preventDefault()
          const clickedSessionID = pressedSessionID
          pressedSessionID = undefined
          if (clickedSessionID && clickedSessionID === props.sessionID) props.openSidebar()
        }}
        onMouseOut={() => {
          pressedSessionID = undefined
        }}
        onMouseDrag={() => {
          pressedSessionID = undefined
        }}
      >
        {label()}
      </text>
    </Show>
  )
}

export default Plugin.define({
  id: "local.todo-progress.tui",
  setup(context) {
    const visibleSidebars = new Map<string, number>()
    const stopSidebar = context.ui.slot({
      append: "sidebar.content",
      render: input => {
        createEffect(() => {
          const sessionID = input.sessionID
          visibleSidebars.set(sessionID, (visibleSidebars.get(sessionID) ?? 0) + 1)
          onCleanup(() => {
            const remaining = (visibleSidebars.get(sessionID) ?? 1) - 1
            if (remaining === 0) visibleSidebars.delete(sessionID)
            else visibleSidebars.set(sessionID, remaining)
          })
        })
        return null
      },
    })
    const stopFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: input => (
        <TodoProgress
          context={context}
          sessionID={input.sessionID}
          openSidebar={() => {
            if (input.sessionID && !visibleSidebars.has(input.sessionID)) {
              context.keymap.dispatch("session.sidebar.toggle")
            }
          }}
        />
      ),
    })

    return () => {
      stopFooter()
      stopSidebar()
    }
  },
})
