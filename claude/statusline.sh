#!/bin/bash
# Claude Code status line: model + context window usage.
input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "?"')
effort=$(echo "$input" | jq -r '.effort.level // empty')
# Bold yellow effort level.
[ -n "$effort" ] && model+=$' (\033[1;38;2;230;219;116m'"$effort"$'\033[0m)'
model_id=$(echo "$input" | jq -r '.model.id // ""')
size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
used=$(echo "$input" | jq -r '.context_window.current_usage // {} |
  ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))')

# Measure progress toward auto-compaction, not the full window.
limit=$(jq -r --arg id "$model_id" --argjson size "$size" '
  [.modelSettings[$id].autoCompactWindow, .autoCompactWindow, $size]
  | map(select(. != null and . > 0)) | min // 0' ~/.claude/settings.json 2>/dev/null)
[ -z "$limit" ] && limit=$size
pct=0
[ "$limit" -gt 0 ] && pct=$((used * 100 / limit))
size=$limit

# Truecolor RGB so the shades don't depend on the terminal theme.
color_for() {
  if   [ "$1" -ge 80 ]; then printf '\033[38;2;239;68;68m'   # red
  elif [ "$1" -ge 50 ]; then printf '\033[38;2;245;158;11m'  # amber
  else printf '\033[38;2;74;222;128m'                        # green
  fi
}
color=$(color_for "$pct")
reset='\033[0m'

# Plan usage limits (only present for Pro/Max, after the first API response).
limits=""
# Time until <epoch> as "2d 4h", "3h 5m" or "12m".
until_reset() {
  local s=$(( ${1%.*} - $(date +%s) ))
  [ "$s" -lt 0 ] && s=0
  local d=$((s / 86400)) h=$((s % 86400 / 3600)) m=$((s % 3600 / 60))
  if   [ "$d" -gt 0 ]; then echo "${d}d ${h}h"
  elif [ "$h" -gt 0 ]; then echo "${h}h ${m}m"
  else echo "${m}m"
  fi
}
limit_segment() { # <label> <window>
  local p r
  p=$(echo "$input" | jq -r ".rate_limits.$2.used_percentage // empty | floor")
  [ -z "$p" ] && return
  r=$(echo "$input" | jq -r ".rate_limits.$2.resets_at // empty")
  limits+=" · $1 $(color_for "$p")${p}% used${reset}"
  [ -n "$r" ] && limits+=" ↻$(until_reset "$r")"
}
limit_segment 5h five_hour
limit_segment 7d seven_day

# Current folder and its parent, each name capped at 20 chars.
short_name() {
  if [ "${#1}" -gt 20 ]; then echo "${1:0:19}…"; else echo "$1"; fi
}
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
if   [ -z "$cwd" ]; then dir=""
elif [ "$cwd" = "$HOME" ]; then dir="~"
elif [ "$cwd" = "/" ]; then dir="/"
else
  name=$(short_name "$(basename "$cwd")")
  parent=$(dirname "$cwd")
  if   [ "$parent" = "$HOME" ]; then dir="~/$name"
  elif [ "$parent" = "/" ]; then dir="/$name"
  else dir="$(short_name "$(basename "$parent")")/$name"
  fi
fi
[ -n "$dir" ] && dir="${dir} · "

# Folder and model on the left; usage pushed to the right edge.
left=$(printf "%b%s" "$dir" "$model")
right=$(printf "${color}%sk/%sk (%s%%)${reset}%b" \
  "$((used / 1000))" "$((size / 1000))" "$pct" "$limits")
visible() { printf '%s' "$1" | sed $'s/\033\\[[0-9;]*m//g'; }
plain_left=$(visible "$left") plain_right=$(visible "$right")
cols=${COLUMNS:-$(tput cols 2>/dev/null || echo 80)}
# Margin for the padding Claude Code draws around the status line.
gap=$((cols - ${#plain_left} - ${#plain_right} - 4))
[ "$gap" -lt 3 ] && gap=3
printf "%s%*s%s\n" "$left" "$gap" "" "$right"
