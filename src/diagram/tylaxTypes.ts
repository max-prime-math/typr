export const TYLAX_VERSION = "0.3.7";
export const TYLAX_CONVERSION_TIMEOUT_MS = 10_000;

export interface TylaxCheckSummary {
  errors: string[];
  warnings: string[];
  infos: string[];
  has_errors: boolean;
}

export interface TylaxConversionResult {
  cetz: string;
  diagnostics: TylaxCheckSummary;
  version: string;
}

export interface TylaxWorkerRequest {
  id: number;
  moduleUrl: string;
  source: string;
}

export type TylaxWorkerResponse =
  | {
      id: number;
      ok: true;
      result: TylaxConversionResult;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };
