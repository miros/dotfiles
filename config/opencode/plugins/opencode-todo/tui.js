import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { TodoRpc } from "./rpc.js";
/** Status glyph + colour, matching the conventions already used elsewhere in opencode's
 * own TUI (e.g. the MCP sidebar's coloured `•` dots, the diff-viewer's `✓`/`✗` file-review
 * marks, and the session-tab `●`/`○` dots) rather than inventing a bespoke bracket
 * notation (`[x]`/`[~]`/`[-]`/`[ ]`) that reads as ASCII-art next to the rest of the UI. */
function statusGlyph(status) {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "●";
    case "cancelled":
      return "✗";
    case "pending":
      return "○";
  }
}
function statusColor(status, theme) {
  switch (status) {
    case "completed":
      return theme.text.feedback.success.base;
    case "in_progress":
      return theme.text.feedback.info.base;
    case "cancelled":
    case "pending":
      return theme.text.muted;
  }
}

/** Below this many todos, the section is always shown expanded with no collapse
 * affordance at all — mirrors `SidebarMcp`'s own threshold exactly (design D2). */
const COLLAPSE_THRESHOLD = 2;

/** Label used for each status in the collapsed-sidebar summary — shorter than the status
 * enum name for `completed` ("done"), and none of the four pluralize with count, so no
 * singular/plural branching is needed (design D3). */
const COLLAPSED_SUMMARY_LABELS = {
  pending: "pending",
  in_progress: "in progress",
  completed: "done",
  cancelled: "cancelled"
};

/** Formats the collapsed Todos header's inline summary: non-zero status counts only, in the
 * fixed order pending → in_progress → completed → cancelled (design D3). Only ever called
 * while the outer `<Show when={feed.todos().length > 0}>` in `TodoSidebar` has already
 * passed, so `todos` is never empty and at least one count is always non-zero. */
export function formatCollapsedSummary(todos) {
  const counts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0
  };
  for (const todo of todos) {
    counts[todo.status] += 1;
  }
  const order = ["pending", "in_progress", "completed", "cancelled"];
  const parts = order.filter(status => counts[status] > 0).map(status => `${counts[status]} ${COLLAPSED_SUMMARY_LABELS[status]}`);
  return `(${parts.join(", ")})`;
}

/**
 * `TodoRpc`'s schemas are plain JSON Schema (design D9 — portable, no schema-library
 * dependency for this package). `@opencode/schema`'s `Rpc.Output`/`EventData` type
 * utilities only derive concrete TS types from an Effect `Schema` or a Standard Schema
 * (Zod, etc.) — a JSON-Schema-only definition resolves to `unknown` at the type level,
 * even though the runtime shape is exactly what the server handler returns. These two
 * interfaces name that runtime shape explicitly so the narrow assertions below are a
 * documented acknowledgement of the limitation, not a guess about behaviour.
 */

/** The minimal slice of `context.client.rpc(TodoRpc)` this module depends on — kept
 * narrow so tests can supply a fake without needing a real RPC client or renderer. */

/** How often the sidebar re-fetches as a safety net, independent of the `changed` event.
 * `client.events.on` is a live-only push channel with no buffering or replay (see spec
 * `todo-tui`'s "Sidebar updates without polling" requirement) — if the underlying event
 * stream silently stops delivering, this bounded reconciliation is what recovers the
 * sidebar instead of leaving it stale indefinitely. */
const SAFETY_NET_INTERVAL_MS = 30_000;

/**
 * Renderer-independent data flow for the sidebar: fetches the focused session's todo
 * list, re-fetches on a `changed` event for that same session, and additionally
 * re-fetches on a bounded interval as a safety net against a missed or silently dropped
 * event (see `SAFETY_NET_INTERVAL_MS`). Never lets an RPC failure escape as a thrown
 * error (design D11) — kept separate from `TodoSidebar` so it is unit-testable without a
 * real `@opentui` renderer (which JSX construction requires; see spec `todo-tui` and
 * tasks.md 6.5 for the live-capture verification that covers rendering itself).
 */
export function createTodoFeed(client, sessionID) {
  const [todos, setTodos] = createSignal([]);
  const [error, setError] = createSignal(null);
  const refresh = async id => {
    try {
      const result = await client.list({
        sessionID: id
      });
      setTodos(result.todos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  createEffect(() => {
    const id = sessionID();
    void refresh(id);
    const dispose = client.events.on("changed", event => {
      const data = event.data;
      if (data.sessionID === id) {
        void refresh(id);
      }
    });
    onCleanup(dispose);
    const intervalId = setInterval(() => void refresh(id), SAFETY_NET_INTERVAL_MS);
    onCleanup(() => clearInterval(intervalId));
  });
  return {
    todos,
    error
  };
}
/** Read-only sidebar contribution — spec `todo-tui`. Sources data exclusively through
 * `context.client.rpc(TodoRpc)`; never imports `src/store.ts` or opens the SQLite file
 * (task 6.4 — verified by this file's import list containing no such import). */
export function TodoSidebar(props) {
  const client = props.context.client.rpc(TodoRpc);
  const feed = createTodoFeed(client, () => props.sessionID);
  const theme = props.context.theme;
  const [view, updateView] = props.context.storage.store("view", {
    initial: {
      open: true
    }
  });
  const toggle = () => {
    if (feed.todos().length <= COLLAPSE_THRESHOLD) return;
    void updateView(draft => {
      draft.open = !draft.open;
    }).catch(error => console.error("Failed to persist Todos sidebar state", error));
  };
  return _$createComponent(Show, {
    get when() {
      return feed.error() === null;
    },
    get fallback() {
      return (() => {
        var _el$9 = _$createElement("text");
        _$insert(_el$9, () => `todo: ${feed.error()}`);
        _$effect(_$p => _$setProp(_el$9, "fg", theme.text.feedback.error.base, _$p));
        return _el$9;
      })();
    },
    get children() {
      return _$createComponent(Show, {
        get when() {
          return feed.todos().length > 0;
        },
        get children() {
          var _el$ = _$createElement("box"),
            _el$2 = _$createElement("box"),
            _el$4 = _$createElement("text"),
            _el$5 = _$createElement("b");
          _$insertNode(_el$, _el$2);
          _$insertNode(_el$2, _el$4);
          _$setProp(_el$2, "flexDirection", "row");
          _$setProp(_el$2, "gap", 1);
          _$setProp(_el$2, "onMouseDown", toggle);
          _$insert(_el$2, _$createComponent(Show, {
            get when() {
              return feed.todos().length > COLLAPSE_THRESHOLD;
            },
            get children() {
              var _el$3 = _$createElement("text");
              _$setProp(_el$3, "selectable", false);
              _$insert(_el$3, () => view.open ? "▼" : "▶");
              _$effect(_$p => _$setProp(_el$3, "fg", theme.text.base, _$p));
              return _el$3;
            }
          }), _el$4);
          _$insertNode(_el$4, _el$5);
          _$setProp(_el$4, "selectable", false);
          _$insertNode(_el$5, _$createTextNode(`Todos`));
          _$insert(_el$4, _$createComponent(Show, {
            get when() {
              return !view.open;
            },
            get children() {
              var _el$7 = _$createElement("span"),
                _el$8 = _$createTextNode(` `);
              _$insertNode(_el$7, _el$8);
              _$insert(_el$7, () => formatCollapsedSummary(feed.todos()), null);
              _$effect(_$p => _$setProp(_el$7, "style", {
                fg: theme.text.muted
              }, _$p));
              return _el$7;
            }
          }), null);
          _$insert(_el$, _$createComponent(Show, {
            get when() {
              return feed.todos().length <= COLLAPSE_THRESHOLD || view.open;
            },
            get children() {
              return _$createComponent(For, {
                get each() {
                  return feed.todos();
                },
                children: todo => {
                  const isCancelled = todo.status === "cancelled";
                  return (() => {
                    var _el$0 = _$createElement("box"),
                      _el$1 = _$createElement("text"),
                      _el$10 = _$createElement("text");
                    _$insertNode(_el$0, _el$1);
                    _$insertNode(_el$0, _el$10);
                    _$setProp(_el$0, "flexDirection", "row");
                    _$setProp(_el$0, "gap", 1);
                    _$setProp(_el$0, "minWidth", 0);
                    _$setProp(_el$1, "flexShrink", 0);
                    _$insert(_el$1, () => statusGlyph(todo.status));
                    _$setProp(_el$10, "wrapMode", "word");
                    _$setProp(_el$10, "truncate", true);
                    _$setProp(_el$10, "maxHeight", 2);
                    _$setProp(_el$10, "flexGrow", 1);
                    _$setProp(_el$10, "flexShrink", 1);
                    _$setProp(_el$10, "minWidth", 0);
                    _$insert(_el$10, () => todo.content);
                    _$effect(_p$ => {
                      var _v$ = statusColor(todo.status, theme),
                        _v$2 = isCancelled ? theme.text.muted : theme.text.base,
                        _v$3 = isCancelled ? TextAttributes.STRIKETHROUGH : TextAttributes.NONE;
                      _v$ !== _p$.e && (_p$.e = _$setProp(_el$1, "fg", _v$, _p$.e));
                      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$10, "fg", _v$2, _p$.t));
                      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$10, "attributes", _v$3, _p$.a));
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined,
                      a: undefined
                    });
                    return _el$0;
                  })();
                }
              });
            }
          }), null);
          _$effect(_$p => _$setProp(_el$4, "fg", theme.text.base, _$p));
          return _el$;
        }
      });
    }
  });
}
export default Plugin.define({
  id: "opencode-todo-tui",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: input => _$createComponent(TodoSidebar, {
        context: context,
        get sessionID() {
          return input.sessionID;
        }
      })
    });
  }
});