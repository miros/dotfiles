import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { TodoRpc } from "../opencode-todo/rpc.js"

type Todo = {
  status: "pending" | "in_progress" | "completed" | "cancelled"
}

type TodoClient = {
  list(input: { sessionID: string }): Promise<unknown>
  events: {
    on(name: "changed", handler: (event: { data: unknown }) => void): () => void
  }
}

function formatProgress(todos: readonly Todo[]) {
  const active = todos.filter(todo => todo.status !== "cancelled")
  if (active.length === 0) return undefined
  const completed = active.filter(todo => todo.status === "completed").length
  return `todo:${completed}/${active.length}`
}

function TodoProgress(props: {
  context: Plugin.Context
  client: TodoClient
  sessionID?: string
  openSidebar: () => void
}) {
  const [todos, setTodos] = createSignal<readonly Todo[]>([])
  let pressedSessionID: string | undefined

  createEffect(() => {
    const sessionID = props.sessionID
    pressedSessionID = undefined
    setTodos([])
    if (!sessionID) return

    let active = true
    let request = 0
    const refresh = async () => {
      const currentRequest = ++request
      try {
        const result = await props.client.list({ sessionID }) as { todos: Todo[] }
        if (active && request === currentRequest) setTodos(result.todos)
      } catch {
        if (active && request === currentRequest) setTodos([])
      }
    }

    const unsubscribe = props.client.events.on("changed", event => {
      const data = event.data as { sessionID: string }
      if (data.sessionID === sessionID) void refresh()
    })
    const interval = setInterval(() => void refresh(), 30_000)
    onCleanup(() => {
      active = false
      unsubscribe()
      clearInterval(interval)
    })
    void refresh()
  })

  const label = () => {
    if (!props.sessionID || props.context.data.session.status(props.sessionID) !== "running") return undefined
    return formatProgress(todos())
  }

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
    const client = context.client.rpc(TodoRpc)
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
          client={client}
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
