# Modificações sobre o Stockfish

Este documento descreve o que o projeto acrescenta ao Stockfish, conforme o requisito do
regulamento do Chess Challenge III de realizar modificações ou melhorias significativas.

## O que é e o que não é do Stockfish

O Stockfish (GPLv3) é executado como **processo separado** e **não foi alterado**: a busca e a
rede de avaliação são as dele. Todo o código deste repositório é uma camada de controle em
torno dele, comunicando-se pelo protocolo UCI. Nenhum código do Stockfish foi copiado.

## Melhorias implementadas

### 1. Livro de aberturas próprio
`src/engine/opening-lines.ts`, `src/engine/opening-book.ts`

Repertório escrito à mão para Brancas (1.e4) e Pretas (1...e5 contra 1.e4, 1...d5 contra 1.d4
e respostas a 1.c4 e 1.Nf3), indexado por posição (FEN sem contadores), então transposições
funcionam. Só os lances da nossa cor entram no livro; os do adversário definem as respostas
previstas. Os lances de livro são instantâneos e poupam relógio para o meio-jogo. Um teste
valida que todas as linhas são legais.

### 2. Gerenciamento de tempo próprio
`src/engine/time-budget.ts`

O Stockfish recebe um orçamento calculado por nós, não o relógio bruto. O cálculo:
- reserva o **tempo humano por lance** (ler, digitar, mover e apertar o relógio), que é uma
  fração grande de 25 minutos;
- divide o restante pelos lances estimados que faltam, com mais tempo no meio-jogo;
- limita cada lance a uma fração do tempo útil;
- entra em modo de emergência (lances rápidos) quando o relógio não cobre o tempo humano.

### 3. Parada adaptativa da busca
`src/engine/stop-policy.ts`

Toda busca roda em modo contínuo e é interrompida por nossa política, que observa cada
iteração do Stockfish:
- **lance estável** (mesmo melhor lance e avaliação sem queda) para no tempo suave;
- **lance instável** (melhor lance mudando ou avaliação caindo) ganha tempo extra até o limite duro;
- **lance óbvio** (muitas iterações profundas concordando) para cedo;
- **mate encontrado e totalmente calculado** para na hora.

### 4. Ponder especulativo com crédito de tempo
`src/server/game-session.ts`, `creditPonderTime` em `src/engine/time-budget.ts`

Enquanto o adversário pensa, o motor calcula na posição prevista (o lance de resposta que ele
próprio indica). Se o adversário joga o lance previsto, o tempo já gasto é descontado do
orçamento e a busca recomeça com a tabela de hash aquecida. Se erra, a busca é descartada.

### 5. Resiliência (travar ou falhar é derrota)
- Detecção de queda ou travamento do processo, reinício automático e nova tentativa.
- Validação de legalidade de todo lance do motor antes de usá-lo.
- Lance de emergência (mate em 1, melhor captura ou lance legal) se o motor falhar de vez.
- Persistência da partida em disco após cada lance, com retomada após queda do servidor.

### 6. Configuração automática do hardware
`src/engine/engine-config.ts`: threads e hash escolhidos conforme CPU e RAM da máquina.

### 7. Observabilidade
Log estruturado por busca (profundidade, avaliação, tempo, nós/s, motivo de parada, acerto de
ponder) em `logs/session-*.jsonl`, para analisar cada partida depois.

## Testes

`npm run check` executa tipos, lint e mais de 110 testes, incluindo integração com o Stockfish
real (parada por mate, substituição de buscas, ponder, recuperação do processo).
