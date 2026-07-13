export type HarperWorkerLanguage = "plaintext" | "markdown" | "typst";

export interface HarperWorkerLint {
  kind: string;
  message: string;
  start: number;
  end: number;
  suggestions: string[];
}

export interface HarperWorkerRequest {
  id: number;
  text: string;
  language: HarperWorkerLanguage;
}

export type HarperWorkerResponse =
  | { id: number; ok: true; lints: HarperWorkerLint[] }
  | { id: number; ok: false; error: string };
