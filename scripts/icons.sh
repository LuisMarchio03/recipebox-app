#!/bin/sh
# Gera os PNGs do manifest a partir dos SVGs (precisa de rsvg-convert).
set -e
cd "$(dirname "$0")/../public"
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
# Maskable: fundo sem cantos e símbolo dentro da zona segura central.
rsvg-convert -w 512 -h 512 maskable.svg -o maskable-512.png
