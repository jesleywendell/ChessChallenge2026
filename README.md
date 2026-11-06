# Chess Challenge III · Assistente

Ferramenta para jogar o Chess Challenge III (ICEV, 06/11/2026) com um motor de xadrez. O
operador informa os lances do adversário no computador, a IA calcula a resposta e mostra qual
peça mover no tabuleiro físico.

O motor de busca é o [Stockfish](https://stockfishchess.org/) rodando localmente como processo
separado. Nada é enviado à internet durante a partida. As modificações próprias estão
descritas em [docs/MODIFICATIONS.md](docs/MODIFICATIONS.md).

## Requisitos

- Node.js 22 ou superior
- Stockfish instalado (macOS: `brew install stockfish`; Windows: baixar o `.exe` em
  stockfishchess.org)

## No Mac (dia da competição)

```bash
brew install node stockfish        # uma vez (precisa de internet)
cd ChessChallenge2026
chmod +x *.sh *.command            # uma vez, se a pasta veio do Windows
./baixar-syzygy.sh                 # uma vez: tablebases (~1 GB) em ~/syzygy
./iniciar.sh                       # ou dois cliques em iniciar.command
```

O `iniciar.sh` usa **8 threads e 1024 MB de hash** (o mesmo que
`ENGINE_HASH_MB=1024 ENGINE_THREADS=8 npm start`), confere Node e Stockfish, reinstala `node_modules` se a pasta veio de outro
sistema, liga as Syzygy de `~/syzygy`, impede o Mac de dormir, compila a interface e abre o
navegador. Se o servidor cair, ele reinicia sozinho. Para recompilar a interface depois de mudar
o código: `rm -rf dist` e rode de novo.

## Rodar (manual)

```bash
npm install
npm run build
npm start        # http://127.0.0.1:8787
```

Para desenvolvimento com recarga automática: `npm run dev` (interface em http://localhost:5173).

### Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `STOCKFISH_PATH` | procura no `PATH` e em pastas comuns | Caminho do executável (obrigatório no Windows se não estiver no `PATH`) |
| `ENGINE_THREADS` | todos os núcleos lógicos | Threads de busca |
| `ENGINE_HASH_MB` | 1/8 da RAM, potência de 2 (64 a 8192) | Tabela de hash |
| `SYZYGY_PATH` | desligado | Pasta com tablebases Syzygy, se houver |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Endereço do servidor |
| `LOG_LEVEL` | `info` | `debug` ou `trace` mostram os comandos UCI |

Exemplo no Windows (PowerShell): `$env:STOCKFISH_PATH="C:\stockfish\stockfish.exe"; npm start`

## Como usar durante a partida

1. Escolha **Brancas** ou **Pretas** e o tempo (padrão 25 min por jogador), depois **Iniciar
   partida**. Inicie quando o juiz liberar o jogo.
2. Quando for a vez da IA, o painel mostra **"Jogue no tabuleiro físico"** com o lance, a peça
   e as casas (ex.: *Cavalo g1 → f3*). Mova a peça e aperte o relógio físico.
3. Informe o lance do adversário de um destes jeitos:
   - clicando na peça e na casa de destino;
   - arrastando a peça;
   - digitando no campo (`e2e4` ou `Nf3`) e pressionando Enter.
4. A IA responde sozinha. Repita.

Recursos de apoio:

- **Desfazer último lance** corrige um lance digitado errado.
- **Relógio:** é uma estimativa. Toque no tempo e digite `mm:ss` para igualar ao relógio físico.
  **Pausar** vale para interrupções do juiz.
- **Virar tabuleiro** e **Copiar PGN** (útil se houver contestação).
- Se o servidor cair ou a página for recarregada, a partida é **retomada do disco** com o
  relógio pausado. Confira o relógio físico e toque em **Retomar**.

## Checklist do dia da competição

- [ ] Stockfish instalado e `npm run check` passando no notebook que será usado.
- [ ] Notebook na tomada, modo de alto desempenho, demais programas fechados.
- [ ] `npm run build` feito; abrir http://127.0.0.1:8787 e jogar um lance de teste.
- [ ] Ajustar o **tempo humano por lance** à sua velocidade real (padrão 5 s; mede o gasto
  de ler, digitar, mover e apertar o relógio). Valor baixo demais gera risco de perder no tempo.
- [ ] Combinar quem digita os lances e quem move as peças.
- [ ] Código enviado por Git a icev@somosicev.com até **04/11/2026**.

## Estrutura

```
src/engine/   Camada do motor: UCI, livro de aberturas, orçamento e parada de tempo
src/server/   Sessão da partida, relógio, persistência, servidor HTTP/WebSocket
src/shared/   Protocolo tipado (Zod) e utilidades de xadrez usadas pelos dois lados
src/web/      Interface React
```

Logs estruturados de cada partida ficam em `logs/session-*.jsonl`, com profundidade, avaliação,
tempo e motivo de parada de cada busca. O estado da partida em andamento fica em `data/`.

## Testes

```bash
npm run check    # tipos + lint + testes
```

Os testes de integração usam o Stockfish real e são ignorados se ele não estiver instalado.
