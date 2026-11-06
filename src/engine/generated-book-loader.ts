import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedBook } from "./opening-book";

const GENERATED_BOOK_PATH = join(import.meta.dirname, "generated-book.json");

/** Lê o livro gerado; se o arquivo faltar ou estiver corrompido, segue só com o livro manual. */
export const loadGeneratedBook = (path = GENERATED_BOOK_PATH): GeneratedBook => {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8")) as GeneratedBook;
  } catch {
    return {};
  }
};
