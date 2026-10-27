#!/usr/bin/env bash
# Capture the real model transcripts the README media is built from, in
# demo/transcripts/:
#   plain.txt         omp's reply with no extension loaded
#   prompt-style.txt  omp's reply with omp-yandere loaded; a single print turn
#                     uses the prompt fallback, so the model plays the persona
#   rewrite.txt       plain.txt after the extension's own rewrite hooks (rewrite.ts)
#
# Runs in a throwaway agent dir so your own AGENTS.md, rules and extensions
# don't shape the replies. Copy your logged-in agent.db into it first:
#   mkdir -p /tmp/omp-demo && cp ~/.omp/agent/agent.db* /tmp/omp-demo/
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
