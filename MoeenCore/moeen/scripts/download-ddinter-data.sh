#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://ddinter2.scbdd.com/static/media/download"
OUTPUT_DIR="${DDINTER_DATA_DIR:-./data/ddinter}"

mkdir -p "$OUTPUT_DIR"

for code in A B D H L P R V; do
  file="ddinter_downloads_code_${code}.csv"

  echo "Downloading $file..."

  curl -fL \
    "${BASE_URL}/${file}" \
    -o "${OUTPUT_DIR}/${file}"
done

echo "DDInter dataset downloaded to $OUTPUT_DIR"
