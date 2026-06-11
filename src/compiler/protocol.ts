import type { CompileResult } from "./types";
import type { CompilerStatus } from "./types";
import type { CompileAssetFile } from "./types";

export interface CompilerCompileRequest {
  id: number;
  type: "compile";
  source: string;
  assets?: CompileAssetFile[];
}

export type CompilerWorkerRequest = CompilerCompileRequest;

export interface CompilerCompileResponse {
  id: number;
  type: "compile-result";
  result: CompileResult;
}

export interface CompilerWorkerErrorResponse {
  id: number;
  type: "error";
  message: string;
}

export interface CompilerWorkerStatusResponse {
  id: number;
  type: "status";
  status: CompilerStatus;
}

export type CompilerWorkerResponse =
  | CompilerCompileResponse
  | CompilerWorkerStatusResponse
  | CompilerWorkerErrorResponse;
