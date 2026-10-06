import type { MoveRecord, Piece } from "../shared/protocol";

const PIECE_NAMES: Record<Piece, string> = {
  p: "Peão",
  n: "Cavalo",
  b: "Bispo",
  r: "Torre",
  q: "Dama",
  k: "Rei",
};

const PROMOTION_NAMES: Record<string, string> = {
  Q: PIECE_NAMES.q,
  R: PIECE_NAMES.r,
  B: PIECE_NAMES.b,
  N: PIECE_NAMES.n,
};

const CASTLING_NAMES: Record<string, string> = {
  "O-O": "Roque curto",
  "O-O-O": "Roque longo",
};

const CHECK_SUFFIX = /[+#]$/;
const PROMOTION_SUFFIX = /=([QRBN])/;

/** Texto para quem executa o lance no tabuleiro físico. */
export const describeMove = ({ san, piece, from, to }: MoveRecord): string => {
  const castling = CASTLING_NAMES[san.replace(CHECK_SUFFIX, "")];
  if (castling) return `${castling}: Rei ${from} → ${to}`;

  const capture = san.includes("x") ? " (captura)" : "";
  const promotionName = PROMOTION_NAMES[PROMOTION_SUFFIX.exec(san)?.[1] ?? ""];
  const promotion = promotionName ? ` e promove a ${promotionName}` : "";
  return `${PIECE_NAMES[piece]} ${from} → ${to}${capture}${promotion}`;
};
