import type { CompileResult } from "./types";
import type { CompilerStatus } from "./types";

export interface CompilerWarmupRequest {
  id: number;
  type: "warmup";
}

export interface CompilerCompileRequest {
  id: number;
  type: "compile";
  source: string;
}

export type CompilerWorkerRequest =
  | CompilerWarmupRequest
  | CompilerCompileRequest;

export interface CompilerWarmupResponse {
  id: number;
  type: "warmup-result";
  ok: true;
}

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
  | CompilerWarmupResponse
  | CompilerCompileResponse
  | CompilerWorkerStatusResponse
  | CompilerWorkerErrorResponse;
