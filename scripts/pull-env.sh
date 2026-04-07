#!/bin/bash
# Pull .env from GitHub Secrets via workflow artifact
set -e

echo "Triggering pull-env workflow..."
gh workflow run pull-env.yml

echo "Waiting for workflow to complete..."
sleep 5

# Poll until complete (max 60s)
for i in $(seq 1 12); do
  RUN_ID=$(gh run list --workflow=pull-env.yml --limit=1 --json databaseId,status -q '.[0] | select(.status=="completed") | .databaseId')
  if [ -n "$RUN_ID" ]; then
    echo "Downloading .env..."
    gh run download "$RUN_ID" -n env-file -D /tmp/env-pull
    cp /tmp/env-pull/.env .env
    rm -rf /tmp/env-pull
    echo "Done — .env written."
    exit 0
  fi
  sleep 5
done

echo "Timed out waiting for workflow. Check: gh run list --workflow=pull-env.yml"
exit 1
