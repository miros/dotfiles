import type { Plugin } from "@opencode/plugin/tui"
import type { TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"

function CommentDialog(props: { context: Plugin.Context; selection: string; finish: (value?: string) => void }) {
  const dimensions = useTerminalDimensions()
  const theme = props.context.theme
  const inputHeight = () => Math.max(2, Math.min(5, dimensions().height - 11))
  const previewHeight = () => Math.max(1, Math.min(6, dimensions().height - inputHeight() - 9))
  let input: TextareaRenderable | undefined
  const confirm = () => props.finish(input?.plainText)

  props.context.keymap.layer(() => ({
    mode: "global",
    priority: 100,
    commands: [
      { bind: "return", run: confirm },
      { bind: "shift+return", run: () => { input?.newLine() } },
      { bind: "ctrl+return", run: confirm },
      { bind: "escape", run: () => props.finish() },
    ],
  }))

  return <box id="plan-reviewer-dialog" width="100%" paddingX={2} paddingBottom={1} gap={1}>
    <text fg={theme.text.base}>Plan reviewer</text>
    <scrollbox
      id="plan-reviewer-selection"
      height="auto"
      minHeight={1}
      maxHeight={previewHeight()}
      flexShrink={0}
      border={["left"]}
      borderColor={theme.text.muted}
      paddingLeft={1}
      contentOptions={{ minHeight: 0 }}
      scrollX={false}
    >
      <text id="plan-reviewer-selection-text" fg={theme.text.muted} wrapMode="word" flexShrink={0}>{props.selection}</text>
    </scrollbox>
    <textarea
      id="plan-reviewer-comment"
      ref={element => { input = element }}
      focused
      width="100%"
      height={inputHeight()}
      wrapMode="word"
      placeholder="Enter your comment"
      textColor={theme.text.base}
      backgroundColor={theme.background.formfield.base}
      onSubmit={confirm}
    />
    <text fg={theme.text.muted}>Shift+Enter newline · Enter confirm · Esc cancel</text>
  </box>
}

export function promptComment(context: Plugin.Context, selection: string): Promise<string | undefined> {
  return new Promise(resolve => {
    let settled = false
    const finish = (value?: string) => {
      if (settled) return
      settled = true
      resolve(value)
      context.ui.dialog.clear()
    }
    context.ui.dialog.show(
      () => <CommentDialog context={context} selection={selection} finish={finish} />,
      () => { settled = true; resolve(undefined) },
    )
    context.ui.dialog.set({ size: "large", centered: true })
  })
}
