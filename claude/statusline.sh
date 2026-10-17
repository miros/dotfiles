#!/bin/bash
# Claude Code status line: model + context window usage.
input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "?"')
effort=$(echo "$input" | jq -r '.effort.level // empty')
[ -n "$effort" ] && model+=" ($effort)"
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
if   [ "$pct" -ge 80 ]; then color='\033[38;2;239;68;68m'   # red
elif [ "$pct" -ge 50 ]; then color='\033[38;2;245;158;11m'  # amber
else color='\033[38;2;74;222;128m'                          # green
fi
reset='\033[0m'

filled=$((pct / 10))
bar=""
for ((i = 0; i < 10; i++)); do
  if [ "$i" -lt "$filled" ]; then bar+="▓"; else bar+="░"; fi
done

printf "%s · ${color}%s %s%%${reset} · %sk/%sk\n" \
  "$model" "$bar" "$pct" "$((used / 1000))" "$((size / 1000))"
