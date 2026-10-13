import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal } from "solid-js"

function HideButton(props: { context: Plugin.Context; sessionID: string }) {
  const [hovered, setHovered] = createSignal(false)
  let pressed = false

  createEffect(() => {
    props.sessionID
    pressed = false
  })

  return (
    <box width="100%" alignItems="flex-start">
      <text
        fg={hovered() ? "#ffffff" : props.context.theme.text.muted}
        selectable={false}
        onMouseOver={() => setHovered(true)}
        onMouseDown={event => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.preventDefault()
          pressed = true
        }}
        onMouseUp={event => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.preventDefault()
          const clicked = pressed
          pressed = false
          if (clicked) props.context.keymap.dispatch("session.sidebar.toggle")
        }}
        onMouseOut={() => {
          setHovered(false)
          pressed = false
        }}
        onMouseDrag={() => {
          pressed = false
        }}
      >
        [Hide]
      </text>
    </box>
  )
}

export default Plugin.define({
  id: "local.sidebar-hide.tui",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.footer",
      render: input => <HideButton context={context} sessionID={input.sessionID} />,
    })
  },
})
