export type ScoreBound = "exact" | "lowerbound" | "upperbound";

export type UciInfo = {
  depth: number;
  scoreCp: number | null;
  mateIn: number | null;
  bound: ScoreBound;
  nodes: number;
  nodesPerSecond: number;
  timeMs: number;
  principalVariation: string[];
};

export type UciMessage =
  | { kind: "uciok" }
  | { kind: "readyok" }
  | { kind: "bestmove"; move: string | null; ponderMove: string | null }
  | { kind: "info"; info: UciInfo }
  | { kind: "other"; line: string };

const NO_MOVE = "(none)";

const readNumber = (tokens: string[], keyword: string): number | null => {
  const index = tokens.indexOf(keyword);
  if (index === -1) return null;
  const value = Number(tokens[index + 1]);
  return Number.isFinite(value) ? value : null;
};

const parseInfo = (tokens: string[]): UciMessage | null => {
  const depth = readNumber(tokens, "depth");
  const pvIndex = tokens.indexOf("pv");
  const scoreIndex = tokens.indexOf("score");
  if (depth === null || pvIndex === -1 || scoreIndex === -1) return null;

  const scoreKind = tokens[scoreIndex + 1];
  const scoreValue = Number(tokens[scoreIndex + 2]);
  if (!Number.isFinite(scoreValue)) return null;
  if (scoreKind !== "cp" && scoreKind !== "mate") return null;

  const afterScore = tokens[scoreIndex + 3];
  const bound: ScoreBound =
    afterScore === "lowerbound" || afterScore === "upperbound" ? afterScore : "exact";

  return {
    kind: "info",
    info: {
      depth,
      scoreCp: scoreKind === "cp" ? scoreValue : null,
      mateIn: scoreKind === "mate" ? scoreValue : null,
      bound,
      nodes: readNumber(tokens, "nodes") ?? 0,
      nodesPerSecond: readNumber(tokens, "nps") ?? 0,
      timeMs: readNumber(tokens, "time") ?? 0,
      principalVariation: tokens.slice(pvIndex + 1),
    },
  };
};

export const parseUciLine = (rawLine: string): UciMessage => {
  const line = rawLine.trim();
  const tokens = line.split(/\s+/);
  const [command] = tokens;

  if (command === "uciok") return { kind: "uciok" };
  if (command === "readyok") return { kind: "readyok" };

  if (command === "bestmove") {
    const move = tokens[1];
    const ponderIndex = tokens.indexOf("ponder");
    return {
      kind: "bestmove",
      move: move === undefined || move === NO_MOVE ? null : move,
      ponderMove: ponderIndex === -1 ? null : (tokens[ponderIndex + 1] ?? null),
    };
  }

  if (command === "info") {
    if (tokens[1] === "string") return { kind: "other", line };
    return parseInfo(tokens) ?? { kind: "other", line };
  }

  return { kind: "other", line };
};
