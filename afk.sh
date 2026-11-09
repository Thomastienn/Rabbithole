
#!/usr/bin/env bash
set -euo pipefail

MAX_RUNS="${1:-20}"

if ! [[ "$MAX_RUNS" =~ ^[1-9][0-9]*$ ]]; then
    echo "Usage: $0 [positive max runs]"
    exit 2
fi

RESULT=$(mktemp)
trap 'rm -f "$RESULT"' EXIT

for ((i = 1; i <= MAX_RUNS; i++)); do
    echo "=== Agent $i / $MAX_RUNS ==="

    : > "$RESULT"

    codex exec -o "$RESULT" \
        "Do the next Beads task, commit, and mark it done.
        Follow your best judgment. You have all author consent.
        Try to finish the task as much as possible.
        If not use beads to break it down even smaller and continue don't FINISH.
        If no tasks remain or you cannot continue,
        end your response with FINISH: <reason>"

    if tail -n 1 "$RESULT" | grep -Eq '^FINISH: .+'; then
        echo "Stopped: $(tail -n 1 "$RESULT")"
        exit 0
    fi
done

echo "Stopped: reached maximum of $MAX_RUNS agents."
