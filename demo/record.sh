#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/transcripts"

export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/tmp/omp-demo}"
MODEL="${MODEL:-anthropic/claude-opus-5-5}"
LEVEL="${LEVEL:-yanderu}"
prompt="$(cat prompt.txt)"

omp -p --no-session --no-tools --no-extensions --model "$MODEL" "$prompt" > plain.txt
omp -p --no-session --no-tools --no-extensions --model "$MODEL" -e ../../src/index.ts "$prompt" > prompt-style.txt
bun ../rewrite.ts "$LEVEL" "$MODEL"

echo "captured demo/transcripts; now run: COLORTERM=truecolor bun demo/capture.ts"
