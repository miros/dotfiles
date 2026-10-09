import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { formatUsd } from "./money.js";
import { CostRpc } from "./rpc.js";
import { localMonthRange } from "./time.js";

/** The slice of `context.client.rpc(CostRpc)` this module depends on; tests supply a fake. */

/** Bounded reconciliation: catches cost written by other server processes and the month rollover. */
const SAFETY_NET_INTERVAL_MS = 60_000;
/** While in the error state, e.g. the server restarted and the RPC is not registered yet. */
const ERROR_RETRY_INTERVAL_MS = 5_000;
const FOOTER_AGENT_LIMIT = 2;
const LOADING = "…";
const FAILED = "Error";
/**
 * Fetches the current local month's summary, refreshing on `changed` and on a safety-net interval,
 * and retrying every few seconds while in the `error` state.
 * Never throws an RPC failure into the host; it becomes the `error` state.
 */
export function createCostFeed(client, now = () => new Date()) {
  const [state, setState] = createSignal({
    kind: "loading"
  });
  let retryTimer;
  let disposed = false;
  const cancelRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const refresh = async () => {
    const [from, to] = localMonthRange(now());
    try {
      const summary = await client.summary({
        from,
        to
      });
      cancelRetry();
      setState({
        kind: "ready",
        summary
      });
    } catch {
      setState({
        kind: "error"
      });
      if (!disposed) retryTimer ??= setTimeout(() => {
        retryTimer = undefined;
        void refresh();
      }, ERROR_RETRY_INTERVAL_MS);
    }
  };
  createEffect(() => {
    void refresh();
    onCleanup(client.events.on("changed", () => void refresh()));
    const timer = setInterval(() => void refresh(), SAFETY_NET_INTERVAL_MS);
    onCleanup(() => clearInterval(timer));
    onCleanup(() => {
      disposed = true;
      cancelRetry();
    });
  });
  return {
    state
  };
}
export function glyph(open) {
  return open ? "▼" : "▶";
}
export function amount(state) {
  switch (state.kind) {
    case "loading":
      return LOADING;
    case "error":
      return FAILED;
    case "ready":
      // `~` marks a total that may be understated because some pricing is unknown.
      return `${state.summary.complete === false ? "~" : ""}${formatUsd(state.summary.totalMicros)}`;
  }
}

/** Single-line footer: never grows the footer, even when opened. */
export function footerLine(state, open) {
  if (!open) return `${glyph(open)} ${amount(state)} this month`;
  const parts = [`${glyph(open)} ${amount(state)}`];
  if (state.kind === "ready") {
    const {
      agents
    } = state.summary;
    for (const entry of agents.slice(0, FOOTER_AGENT_LIMIT)) {
      parts.push(`${entry.agent} ${formatUsd(entry.micros)}`);
    }
    if (agents.length > FOOTER_AGENT_LIMIT) parts.push(`+${agents.length - FOOTER_AGENT_LIMIT}`);
  }
  return parts.join(" · ");
}
/** Same storage key in every slot: one persisted open/closed state shared everywhere. */
export function createOpenState(storage) {
  const [view, updateView] = storage.store("view", {
    initial: {
      open: false
    }
  });
  const toggle = () => {
    void updateView(draft => {
      draft.open = !draft.open;
    }).catch(error => console.error("Failed to persist cost block state", error));
  };
  return {
    view,
    toggle
  };
}
export function breakdownLines(state, breakdown) {
  if (state.kind !== "ready") return [];
  const {
    summary
  } = state;
  // A server process still running an older plugin replies without `models`/`providers`.
  switch (breakdown) {
    case "agent":
      return summary.agents.map(e => ({
        label: e.agent,
        amount: formatUsd(e.micros)
      }));
    case "model":
      return (summary.models ?? []).map(e => ({
        label: e.model,
        amount: formatUsd(e.micros)
      }));
    case "provider":
      return (summary.providers ?? []).map(e => ({
        label: e.provider,
        amount: formatUsd(e.micros)
      }));
  }
}
const BREAKDOWN_LABELS = [["agent", "Agents"], ["model", "Models"], ["provider", "Providers"]];

/** Toggle row pieces; the active tab is bracketed and bold so it reads without colour. */
export function toggleSegments(active) {
  return [{
    text: "View",
    bold: false
  }, ...BREAKDOWN_LABELS.map(([mode, label]) => mode === active ? {
    text: `[${label}]`,
    bold: true,
    mode
  } : {
    text: label,
    bold: false,
    mode
  })];
}
function useCostBlock(context) {
  const feed = createCostFeed(context.client.rpc(CostRpc));
  return {
    feed,
    ...createOpenState(context.storage)
  };
}
export function CostSidebar(props) {
  const {
    feed,
    view,
    toggle
  } = useCostBlock(props.context);
  const theme = props.context.theme;
  const [breakdown, setBreakdown] = createSignal("agent");
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createElement("b"),
      _el$8 = _$createTextNode(`: `),
      _el$9 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "onMouseDown", toggle);
    _$setProp(_el$3, "selectable", false);
    _$insert(_el$3, () => glyph(view.open));
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$4, _el$9);
    _$setProp(_el$4, "flexDirection", "row");
    _$insertNode(_el$5, _el$6);
    _$insertNode(_el$5, _el$8);
    _$setProp(_el$5, "selectable", false);
    _$insertNode(_el$6, _$createTextNode(`This month`));
    _$insert(_el$9, () => amount(feed.state()));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return view.open;
      },
      get children() {
        return [_$createComponent(Show, {
          get when() {
            return feed.state().kind === "ready";
          },
          get children() {
            var _el$0 = _$createElement("box");
            _$setProp(_el$0, "flexDirection", "row");
            _$setProp(_el$0, "gap", 2);
            _$setProp(_el$0, "paddingLeft", 2);
            _$insert(_el$0, _$createComponent(For, {
              get each() {
                return toggleSegments(breakdown());
              },
              children: segment => (() => {
                var _el$1 = _$createElement("text");
                _$setProp(_el$1, "selectable", false);
                _$setProp(_el$1, "onMouseDown", () => {
                  if (segment.mode) setBreakdown(segment.mode);
                });
                _$insert(_el$1, (() => {
                  var _c$ = _$memo(() => !!segment.bold);
                  return () => _c$() ? (() => {
                    var _el$10 = _$createElement("b");
                    _$insert(_el$10, () => segment.text);
                    return _el$10;
                  })() : segment.text;
                })());
                _$effect(_$p => _$setProp(_el$1, "fg", theme.text.action.primary.base, _$p));
                return _el$1;
              })()
            }));
            return _el$0;
          }
        }), _$createComponent(For, {
          get each() {
            return breakdownLines(feed.state(), breakdown());
          },
          children: line => (() => {
            var _el$11 = _$createElement("box"),
              _el$12 = _$createElement("text"),
              _el$13 = _$createElement("text");
            _$insertNode(_el$11, _el$12);
            _$insertNode(_el$11, _el$13);
            _$setProp(_el$11, "flexDirection", "row");
            _$setProp(_el$11, "gap", 1);
            _$setProp(_el$11, "paddingLeft", 2);
            _$setProp(_el$12, "flexGrow", 1);
            _$setProp(_el$12, "truncate", true);
            _$insert(_el$12, () => line.label);
            _$insert(_el$13, () => line.amount);
            _$effect(_p$ => {
              var _v$4 = theme.text.muted,
                _v$5 = theme.text.muted;
              _v$4 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$4, _p$.e));
              _v$5 !== _p$.t && (_p$.t = _$setProp(_el$13, "fg", _v$5, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$11;
          })()
        })];
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = theme.text.base,
        _v$2 = theme.text.base,
        _v$3 = feed.state().kind === "error" ? theme.text.feedback.error.base : theme.text.base;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$9, "fg", _v$3, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}
export function CostFooter(props) {
  const {
    feed,
    view,
    toggle
  } = useCostBlock(props.context);
  return (() => {
    var _el$14 = _$createElement("box"),
      _el$15 = _$createElement("text");
    _$insertNode(_el$14, _el$15);
    _$setProp(_el$14, "onMouseDown", toggle);
    _$setProp(_el$15, "truncate", true);
    _$insert(_el$15, () => footerLine(feed.state(), view.open));
    _$effect(_$p => _$setProp(_el$15, "fg", feed.state().kind === "error" ? props.context.theme.text.feedback.error.base : props.context.theme.text.muted, _$p));
    return _el$14;
  })();
}
export default Plugin.define({
  id: "opencode-cmon-tui",
  setup(context) {
    const sidebar = context.ui.slot({
      prepend: "sidebar.content",
      render: () => _$createComponent(CostSidebar, {
        context: context
      })
    });
    const footer = context.ui.slot({
      append: "home.footer.status",
      render: () => _$createComponent(CostFooter, {
        context: context
      })
    });
    return async () => {
      await sidebar();
      await footer();
    };
  }
});