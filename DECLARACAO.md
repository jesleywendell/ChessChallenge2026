# Declaração de base e autoria · Chess Challenge III (ICEV 2026)

## 1. Base utilizada (não é nossa)

| Item | Valor |
| --- | --- |
| Motor | **Stockfish 19** (GPLv3), executável para macOS (Homebrew `brew install stockfish` ou o build oficial `stockfish-macos-m1-apple-silicon`) |
| Tag | [`sf_19`](https://github.com/official-stockfish/Stockfish/releases/tag/sf_19) |
| Commit | `edb0d9db6731067ec50ce619ff372b463bc4dd5d` |
| Publicação | 05/09/2026 |
| Como é usado | Processo separado, falando o protocolo UCI. **Nenhuma linha do Stockfish foi copiada nem alterada**: busca e rede neural (NNUE) são dele. |
| Binário | Em Mac com Apple Silicon (M1 a M4) o build nativo arm64 usa as instruções NEON/dotprod do chip. AVX2/BMI2 são instruções Intel e não se aplicam. O `iniciar.sh` mostra a versão que está rodando, e o log grava a linha `id name`. |
| Tablebases | Syzygy 3-4-5 peças (dados públicos), lidas pelo próprio Stockfish via `SyzygyPath`. |
| Bibliotecas | chess.js (regras/legalidade), Fastify, React, Zod, Pino (ver `package.json`). |

Todo o resto deste repositório é **código nosso**: uma camada de controle que decide *quando*
o Stockfish pensa, *quanto* tempo, *em qual posição* e *qual* das linhas dele jogamos.

## 2. O que é nosso (e quem explica)

Cada integrante domina uma parte e consegue explicá-la com o código aberto.

### Parte A: gestão de tempo e parada adaptativa (Integrante 1: ________)

Arquivos: `src/engine/time-budget.ts`, `src/engine/stop-policy.ts`

- **Por que o padrão do Stockfish não serve:** são 25 min sem incremento e um humano
  precisa ler, mover a peça e apertar o relógio a cada lance. O Stockfish não sabe disso.
  Por isso nunca passamos o relógio a ele: rodamos `go infinite` e mandamos `stop` nós mesmos.
- **Orçamento por lance** (`computeThinkBudget`): reserva o tempo humano de pelo menos
  60 lances e mais 10 s de segurança. Divide o resto pelos lances estimados (mínimo 40) e
  multiplica pela fase: abertura ×0,8, **meio-jogo (lances 15 a 35) ×1,4**, final ×0,75
  (no final as Syzygy resolvem). Isso gera um limite suave e um limite duro (2,5× o suave,
  no máximo 6% do tempo útil).
- **Calibração:** um teste simula partidas de até 200 lances. Garantimos que não perdemos
  no tempo antes do lance 100 nem no pior caso (toda busca até o limite duro). A versão
  anterior perdia por volta do lance 55.
- **Parada adaptativa** (`createStopPolicy`): olha cada iteração do Stockfish:
  - *lance estável* (mesmo lance por 3 iterações, avaliação sem cair mais de 0,25): para no limite suave;
  - *lance instável* (melhor lance trocando ou avaliação caindo): ganha tempo até o limite duro;
  - *lance óbvio* (8 iterações profundas concordando): para com 30% do suave;
  - *mate totalmente calculado*: para na hora.
- **Vantagem de relógio** (`hasClockPressure` em `game-session.ts`): se o adversário tem
  menos de 60% do nosso tempo e menos de 8 min, jogamos com 60% do orçamento e o
  anti-empate fica mais tolerante, para manter a posição complicada e pressionar o relógio dele.

### Parte B: ponder com crédito de tempo e anti-empate (Integrante 2: ________)

Arquivos: `src/server/game-session.ts` (`#startPonder`, `#collectPonder`),
`creditPonderTime` em `src/engine/time-budget.ts`, `src/engine/anti-draw.ts`

- **Ponder especulativo:** depois do nosso lance, o Stockfish já analisa a posição que
  surge se o adversário jogar o lance que ele prevê (2º lance da variante principal).
- **Crédito:** se o adversário joga o previsto, o tempo já pensado é **descontado** do
  orçamento do lance (`creditPonderTime`) e a busca recomeça com a tabela de hash
  aquecida, chegando rápido à mesma profundidade. Se erra, a busca é descartada.
- **Anti-empate:** contra outro Stockfish quase tudo empata, e empate vale 1 ponto contra 3.
  Pedimos ao Stockfish as 3 melhores linhas (`MultiPV 3`) e escolhemos entre elas:
  - avaliação < −0,30 (estamos pior): jogamos o lance do Stockfish e aceitamos o empate;
  - se o melhor lance **repete posição**: trocamos por uma alternativa que não repita, desde que ela fique ≥ −0,30;
  - senão, entre lances a até 0,15 do melhor (0,25 com vantagem de relógio), escolhemos o
    que **mantém mais peças** depois da variante e **evita troca simplificadora**
    (captura seguida de recaptura na mesma casa).
  - Custo conhecido: com MultiPV o Stockfish divide a busca entre 3 linhas e calcula um pouco
    menos fundo. Pode ser desligado com `ANTI_DRAW=0` / `ENGINE_MULTIPV=1`.

### Parte C: livro de aberturas e resiliência (Integrante 3: ________)

Arquivos: `scripts/gerar-livro.ts`, `src/engine/generated-book.json`,
`src/engine/opening-book.ts`, `src/engine/opening-lines.ts`, `src/engine/stockfish-engine.ts`,
`src/server/game-store.ts`, `iniciar.sh`

- **Livro gerado por nós, offline** (`scripts/gerar-livro.ts`): percorre a árvore de
  aberturas até 12 lances nossos. Em cada posição nossa, o Stockfish analisa 30 s com
  MultiPV 3. Entre os lances a até 0,15 do melhor (e sem cair abaixo de +0,05 de Brancas ou
  −0,45 de Pretas) escolhemos o mais **desequilibrado**: mais peças, peões assimétricos,
  roques opostos, bispo × cavalo, com pequena preferência pelo lance que *não* é o 1º do
  Stockfish, para tirar o adversário do livro dele. Nas posições do adversário ramificamos
  nas 2 respostas mais prováveis dele até o lance 3 e na mais provável depois disso.
  Lances de livro são instantâneos e economizam relógio. O livro manual
  (`opening-lines.ts`) cobre o que o gerado não cobre. Indexação por posição (FEN), então
  transposições funcionam. Gerado com 2 threads em Linux (Stockfish 16, por limitação do
  ambiente de geração).
- **Resiliência** ("se o software travar ou falhar, a equipe perde"):
  - processo do Stockfish monitorado: queda ou falta de resposta ao `stop` em 3 s → mata e reinicia;
  - **nova tentativa com potência decrescente**: normal → metade das threads, 1/4 do hash e
    50% do tempo → modo seguro (1 thread, 16 MB, 20% do tempo) → lance de emergência;
  - todo lance do motor tem a legalidade conferida antes de ser mostrado;
  - partida salva em disco a cada lance (gravações em fila, escrita atômica);
  - `iniciar.sh` (macOS) reinicia o servidor se ele cair, e a partida volta do último snapshot.
    Ele também impede o Mac de dormir (`caffeinate`), recusa abrir um segundo servidor na
    mesma porta e reinstala as dependências se a pasta veio de outro sistema.

## 3. Perguntas prováveis da banca

- **"Isso não é só o Stockfish?"** A força de cálculo é do Stockfish, e declaramos isso. A
  nossa parte decide quanto tempo cada lance recebe num controle sem incremento com
  operador humano, aproveita o tempo do adversário, escolhe entre as linhas dele para
  evitar empates e prepara aberturas próprias. Com o mesmo Stockfish, a nossa camada
  muda o resultado: por exemplo, não perde no tempo em partidas longas.
- **"Por que não usar `go wtime/btime`?"** Porque o Stockfish não sabe do tempo humano
  (cerca de 5 s por lance, ~8 min numa partida de 100 lances) e gastaria o relógio errado.
- **"O anti-empate não deixa o programa mais fraco?"** Um pouco, de propósito: só
  aceitamos lances a no máximo 0,15 peão do melhor e nunca abaixo de −0,30. Trocamos uma
  perda mínima de precisão por mais chances de vitória (3 pontos contra 1).
- **"Como provam que funciona?"** `npm test` roda mais de 140 testes, incluindo a
  simulação de relógio, o anti-empate, a recuperação de falhas e a integração com o
  Stockfish real. Os logs de cada partida ficam em `logs/` (profundidade, tempo, motivo de
  parada, decisões do anti-empate).
