#!/bin/bash

SESSION="claude-bonapinta"
DIR="/var/www/bonapinta"

tmux has-session -t "$SESSION" 2>/dev/null

if [ $? != 0 ]; then
  echo "Creando sesión '$SESSION'..."
  tmux new-session -d -s "$SESSION" -c "$DIR"
  tmux send-keys -t "$SESSION" "claude" C-m
else
  echo "Reconectando a '$SESSION'..."
fi

tmux attach -t "$SESSION"
