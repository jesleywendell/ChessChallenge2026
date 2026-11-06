#!/usr/bin/env bash
# Baixa as tablebases Syzygy de 3 a 5 peças (~1 GB, 290 arquivos) para ~/syzygy.
#   Uso: ./baixar-syzygy.sh [pasta]
# Pode rodar de novo: arquivos já baixados são pulados.
set -u
DEST="${1:-$HOME/syzygy}"
mkdir -p "$DEST"
MIRRORS=(
  "https://tablebase.lichess.ovh/tables/standard/3-4-5/"
  "http://tablebase.sesse.net/syzygy/3-4-5/"
)
BASE=""
for mirror in "${MIRRORS[@]}"; do
  echo "Lendo lista de arquivos em $mirror ..."
  LIST=$(curl -fsSL --max-time 30 "$mirror" | grep -oE 'href="[A-Za-z0-9]+\.rtb[wz]"' | cut -d'"' -f2 | sort -u)
  if [ -n "$LIST" ]; then BASE="$mirror"; break; fi
  echo "  falhou."
done
[ -n "$BASE" ] || { echo "ERRO: nenhum espelho respondeu."; exit 1; }

TOTAL=$(echo "$LIST" | wc -l | tr -d ' ')
echo "$TOTAL arquivos (o esperado é 290)."
i=0
for name in $LIST; do
  i=$((i + 1))
  [ -s "$DEST/$name" ] && continue
  echo "[$i/$TOTAL] $name"
  curl -fsSL --retry 3 --retry-delay 2 -o "$DEST/$name.part" "$BASE$name" \
    && mv "$DEST/$name.part" "$DEST/$name" \
    || echo "  falhou: $name (rode o script de novo depois)"
done
COUNT=$(ls "$DEST"/*.rtb? 2>/dev/null | wc -l | tr -d ' ')
echo "Pronto: $COUNT arquivos, $(du -sh "$DEST" | cut -f1) em $DEST"
echo "O iniciar.sh já usa ~/syzygy automaticamente."
