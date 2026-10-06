export type StopReason = "hard-limit" | "soft-stable" | "easy-move" | "mate-found";

export type SearchIteration = {
  depth: number;
  bestMove: string;
  scoreCp: number | null;
  mateIn: number | null;
};

export type StopPolicy = {
  observe: (iteration: SearchIteration) => void;
  shouldStop: (elapsedMs: number) => StopReason | null;
};

const MATE_SCORE_CP = 10_000;
const MIN_STABLE_DEPTH = 12;
const STABLE_ITERATIONS = 3;
const MAX_SCORE_DROP_CP = 25;
const EASY_MOVE_MIN_DEPTH = 16;
const EASY_MOVE_ITERATIONS = 8;
const EASY_MOVE_SCORE_SPREAD_CP = 15;
const EASY_MOVE_SOFT_SHARE = 0.3;
const MATE_DEPTH_MARGIN = 2;

const comparableScore = ({ scoreCp, mateIn }: SearchIteration): number => {
  if (mateIn !== null) return Math.sign(mateIn) * (MATE_SCORE_CP - Math.abs(mateIn));
  return scoreCp ?? 0;
};

const sameBestMove = (iterations: readonly SearchIteration[]): boolean =>
  iterations.every((iteration) => iteration.bestMove === iterations[0]?.bestMove);

const scoreSpread = (iterations: readonly SearchIteration[]): number => {
  const scores = iterations.map(comparableScore);
  return Math.max(...scores) - Math.min(...scores);
};

/**
 * Decide quando interromper uma busca `go infinite`: lances estáveis param no
 * tempo suave, lances instáveis (melhor lance trocando ou avaliação caindo)
 * ganham tempo extra até o limite duro.
 */
export const createStopPolicy = ({
  softMs,
  hardMs,
}: {
  softMs: number;
  hardMs: number;
}): StopPolicy => {
  const iterationsByDepth = new Map<number, SearchIteration>();

  const orderedIterations = (): SearchIteration[] =>
    [...iterationsByDepth.values()].sort((a, b) => a.depth - b.depth);

  const isStable = (iterations: readonly SearchIteration[]): boolean => {
    const recent = iterations.slice(-STABLE_ITERATIONS);
    const latest = recent.at(-1);
    if (!latest || recent.length < STABLE_ITERATIONS) return false;
    if (latest.depth < MIN_STABLE_DEPTH || !sameBestMove(recent)) return false;
    const bestRecentScore = Math.max(...recent.map(comparableScore));
    return bestRecentScore - comparableScore(latest) <= MAX_SCORE_DROP_CP;
  };

  const isEasyMove = (iterations: readonly SearchIteration[]): boolean => {
    const recent = iterations.slice(-EASY_MOVE_ITERATIONS);
    const latest = recent.at(-1);
    if (!latest || recent.length < EASY_MOVE_ITERATIONS) return false;
    if (latest.depth < EASY_MOVE_MIN_DEPTH || !sameBestMove(recent)) return false;
    return scoreSpread(recent) <= EASY_MOVE_SCORE_SPREAD_CP;
  };

  const hasFoundMate = (latest: SearchIteration): boolean =>
    latest.mateIn !== null &&
    latest.mateIn > 0 &&
    latest.depth >= 2 * latest.mateIn + MATE_DEPTH_MARGIN;

  return {
    observe: (iteration) => {
      iterationsByDepth.set(iteration.depth, iteration);
    },
    shouldStop: (elapsedMs) => {
      if (elapsedMs >= hardMs) return "hard-limit";

      const iterations = orderedIterations();
      const latest = iterations.at(-1);
      if (!latest) return null;

      if (hasFoundMate(latest)) return "mate-found";
      if (elapsedMs >= softMs * EASY_MOVE_SOFT_SHARE && isEasyMove(iterations)) return "easy-move";
      if (elapsedMs >= softMs && isStable(iterations)) return "soft-stable";
      return null;
    },
  };
};
