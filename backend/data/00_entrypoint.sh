#!/usr/bin/env bash
# docker-entrypoint-initdb.d runs scripts in alphabetical order.
# This script is a safety net — the main seeding is in docker-compose healthchecks.
set -e
echo "DB init entrypoint starting..."
