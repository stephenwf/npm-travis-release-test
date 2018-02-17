#!/usr/bin/env bash
export PATH="$(npm bin):$PATH"

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Lerna version: $(lerna -v)"

cat package.json | jq2 '$.release.version'