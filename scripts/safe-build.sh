#!/usr/bin/env bash
# 安全构建：先检查可用内存，再串行构建 api / web。
# 背景：2026-11-27 18:17 本机 8G 内存被 chrome/python/docker build 同时吃满，
#       内核 OOM 杀掉了 openclaw-gateway 服务里的进程，网关一度不可用。
set -euo pipefail
cd "$(dirname "$0")/.."

avail_mb=$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)
echo "MemAvailable: ${avail_mb} MB"
if [ "${avail_mb}" -lt 2500 ]; then
  echo "可用内存低于 2.5G，拒绝构建。先停掉不用的容器或等待其他任务结束。" >&2
  docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' | sort -k2 -hr | head -8 >&2 || true
  exit 1
fi

echo "==> build api"
docker compose build api
echo "==> build web"
docker compose build web
echo "done"
