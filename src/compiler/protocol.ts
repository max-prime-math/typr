import type { CompileAssetFile, CompileDocumentOptions, CompileResult, CompilerStatus } from "./types";

export interface CompilerCompileRequest {
  id: number;
  type: "compile";
  source: string;
  assets?: CompileAssetFile[];
  options?: CompileDocumentOptions;
}

export interface CompilerWarmRequest {
  id: number;
  type: "warm";
}

export type CompilerWorkerRequest = CompilerCompileRequest | CompilerWarmRequest;

export interface CompilerCompileResponse {
  id: number;
  type: "compile-result";
  result: CompileResult;
}
export interface CompilerWarmResponse {
  id: number;
  type: "warm-result";
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
  | CompilerWarmResponse
  | CompilerWorkerStatusResponse
  | CompilerWorkerErrorResponse;
