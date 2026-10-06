export type ThinkBudgetInput = {
  remainingMs: number;
  fullmoveNumber: number;
  humanOverheadMs: number;
};

export type ThinkBudget = {
  softMs: number;
  hardMs: number;
};

const EXPECTED_GAME_MOVES = 45;
const MIN_MOVES_LEFT = 15;
const EMERGENCY_RESERVE_MS = 10_000;
const MAX_SINGLE_MOVE_SHARE = 0.2;
const HARD_TO_SOFT_RATIO = 3;
const OPENING_LAST_MOVE = 10;
const MIDDLEGAME_LAST_MOVE = 35;
const OPENING_MULTIPLIER = 0.8;
const MIDDLEGAME_MULTIPLIER = 1.3;
const ENDGAME_MULTIPLIER = 1;
const PANIC_SOFT_MS = 300;
const PANIC_HARD_MS = 1_000;

const phaseMultiplier = (fullmoveNumber: number): number => {
  if (fullmoveNumber <= OPENING_LAST_MOVE) return OPENING_MULTIPLIER;
  if (fullmoveNumber <= MIDDLEGAME_LAST_MOVE) return MIDDLEGAME_MULTIPLIER;
  return ENDGAME_MULTIPLIER;
};

const MIN_FOLLOW_UP_MS = 500;
const FOLLOW_UP_HARD_TO_SOFT_RATIO = 2;

/**
 * Após um ponder acertado a busca recomeça com a tabela de hash aquecida, então
 * só falta o que o ponder ainda não cobriu do orçamento.
 */
export const creditPonderTime = (budget: ThinkBudget, ponderedMs: number): ThinkBudget => {
  const softMs = Math.max(MIN_FOLLOW_UP_MS, Math.round(budget.softMs - ponderedMs));
  const hardMs = Math.max(
    softMs * FOLLOW_UP_HARD_TO_SOFT_RATIO,
    Math.round(budget.hardMs - ponderedMs),
  );
  return { softMs, hardMs };
};

export const estimateMovesLeft = (fullmoveNumber: number): number =>
  Math.max(MIN_MOVES_LEFT, EXPECTED_GAME_MOVES - fullmoveNumber);

/**
 * Cada lance nosso custa, além do motor, o tempo humano de ler, digitar,
 * mover a peça e apertar o relógio. Esse custo é reservado para os lances
 * restantes antes de dividir o relógio.
 */
export const computeThinkBudget = ({
  remainingMs,
  fullmoveNumber,
  humanOverheadMs,
}: ThinkBudgetInput): ThinkBudget => {
  const movesLeft = estimateMovesLeft(fullmoveNumber);
  const usableMs = remainingMs - EMERGENCY_RESERVE_MS - humanOverheadMs * movesLeft;

  if (usableMs <= 0) return { softMs: PANIC_SOFT_MS, hardMs: PANIC_HARD_MS };

  const softMs = Math.max(
    PANIC_SOFT_MS,
    Math.round((usableMs / movesLeft) * phaseMultiplier(fullmoveNumber)),
  );
  const hardCapMs = Math.max(PANIC_HARD_MS, usableMs * MAX_SINGLE_MOVE_SHARE);
  const hardMs = Math.round(Math.min(softMs * HARD_TO_SOFT_RATIO, hardCapMs));

  return { softMs: Math.min(softMs, hardMs), hardMs };
};
