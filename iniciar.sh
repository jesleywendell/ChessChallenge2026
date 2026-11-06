#!/usr/bin/env bash
# Chess Challenge III · inicia o assistente no macOS.
#   Uso: ./iniciar.sh   (ou dois cliques em iniciar.command)
# Se o servidor cair, ele reinicia sozinho e a partida volta do disco
# (data/current-game.json) com o relógio pausado: confira o relógio físico e toque em Retomar.
set -u
cd "$(dirname "$0")"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mERRO: %s\033[0m\n' "$*"; read -r -p "Enter para sair..." _; exit 1; }

# ---------- Node ----------
command -v node >/dev/null || fail "Node.js não encontrado. Instale com: brew install node"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $NODE_MAJOR encontrado; precisa do 22 ou superior (brew upgrade node)."

# node_modules copiada de outro sistema (ex.: Windows) não funciona: reinstala.
PLATFORM="$(uname -sm)"
if [ ! -f node_modules/.plataforma ] || [ "$(cat node_modules/.plataforma)" != "$PLATFORM" ]; then
  say "Instalando dependências para $PLATFORM ..."
  rm -rf node_modules
  npm ci || fail "npm ci falhou (precisa de internet só nesta etapa)."
  echo "$PLATFORM" > node_modules/.plataforma
  rm -rf dist
fi

# ---------- Stockfish ----------
if [ -z "${STOCKFISH_PATH:-}" ]; then
  for candidate in \
    "$(command -v stockfish 2>/dev/null)" \
    /opt/homebrew/bin/stockfish /usr/local/bin/stockfish \
    "$HOME"/stockfish/stockfish* "$HOME"/Downloads/stockfish*/stockfish* "$HOME"/Downloads/stockfish*; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then STOCKFISH_PATH="$candidate"; break; fi
  done
fi
[ -n "${STOCKFISH_PATH:-}" ] || fail "Stockfish não encontrado. Rode: brew install stockfish  (ou defina STOCKFISH_PATH)"
# Binário baixado da internet: tira a quarentena do Gatekeeper e garante permissão de execução.
xattr -d com.apple.quarantine "$STOCKFISH_PATH" 2>/dev/null || true
chmod +x "$STOCKFISH_PATH" 2>/dev/null || true
VERSION=$(printf 'uci\nquit\n' | "$STOCKFISH_PATH" 2>/dev/null | grep -m1 '^id name' | cut -c9-)
[ -n "$VERSION" ] || fail "O Stockfish em $STOCKFISH_PATH não respondeu. Binário errado para este Mac?"
export STOCKFISH_PATH
say "Stockfish: $VERSION ($STOCKFISH_PATH)"

# ---------- Syzygy ----------
if [ -z "${SYZYGY_PATH:-}" ] && [ -f "$HOME/syzygy/KQvK.rtbw" ]; then export SYZYGY_PATH="$HOME/syzygy"; fi
if [ -n "${SYZYGY_PATH:-}" ]; then
  say "Syzygy: $SYZYGY_PATH ($(ls "$SYZYGY_PATH"/*.rtb? 2>/dev/null | wc -l | tr -d ' ') arquivos)"
else
  echo "AVISO: tablebases Syzygy não encontradas em ~/syzygy. Rode ./baixar-syzygy.sh"
fi

# ---------- Opções (descomente para usar) ----------
# export ENGINE_THREADS=10
# export ENGINE_HASH_MB=2048
# export ANTI_DRAW=0          # desliga o anti-empate
# export ENGINE_MULTIPV=3

# ---------- Um servidor só ----------
if lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -nP -iTCP:8787 -sTCP:LISTEN
  fail "A porta 8787 já está em uso: já existe um servidor aberto. Feche a outra janela e rode de novo."
fi

[ -f dist/web/index.html ] || { say "Compilando a interface..."; npm run build || fail "build falhou"; }

# ---------- Não deixar o Mac dormir enquanto isto estiver aberto ----------
caffeinate -dimsu -w $$ &

if pmset -g batt 2>/dev/null | grep -q "Battery Power"; then
  echo "AVISO: o Mac está na bateria. Ligue na tomada (a CPU pode ser limitada na bateria)."
fi

trap 'echo; say "Encerrado."; exit 0' INT TERM
( sleep 3; open "http://127.0.0.1:8787" ) &

while true; do
  say "[$(date +%H:%M:%S)] Iniciando servidor em http://127.0.0.1:8787 ..."
  npm start
  echo "[$(date +%H:%M:%S)] Servidor encerrou (código $?). Reiniciando em 2 s... (Ctrl+C para sair)"
  sleep 2
done
