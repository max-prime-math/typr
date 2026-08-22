import type { FileInput } from "texlyre-busytex";
import {
  TYPR_COMPANION_PROTOCOL_VERSION,
  type CompileRequest,
  type ProjectFile
} from "@max-prime-math/typr-companion-protocol";
import type { TyprProjectRepository } from "../project/projectState";
import {
  CompanionClient,
  CompanionClientError,
  type CompanionConnectionStatus
} from "./companionClient";
import {
  collectLatexFiles,
  compileLatexDocument,
  createLatexCompilePlan,
  type LatexCompileDriver,
  type LatexCompileMode,
  type LatexCompileOptions
} from "./latexCompiler";
import type { CompileDiagnostic, CompileResult, CompilerStatus } from "./types";

export type LatexCompilerProviderId = "busytex" | "companion";

export interface LatexCompilerProvider {
  id: LatexCompilerProviderId;
  label: string;
  isAvailable(options: LatexProviderAvailabilityOptions): boolean;
  compile(options: LatexCompileOptions): Promise<CompileResult>;
}

export interface LatexProviderAvailabilityOptions {
  companion: CompanionConnectionStatus;
  compileDriver: LatexCompileDriver;
}

export function selectLatexCompilerProvider(
  options: LatexProviderAvailabilityOptions
): LatexCompilerProviderId {
  return companionProvider.isAvailable(options) ? "companion" : "busytex";
}

export const busyTexProvider: LatexCompilerProvider = {
  id: "busytex",
  label: "BusyTeX",
  isAvailable: () => true,
  compile: compileLatexDocument
};

export function createCompanionProvider(client: CompanionClient): LatexCompilerProvider {
  return {
    id: "companion",
    label: "Typr Server",
    isAvailable: companionProvider.isAvailable,
    compile: (options) => compileWithCompanion(client, options)
  };
}

const companionProvider: Pick<LatexCompilerProvider, "isAvailable"> = {
  isAvailable: ({ companion, compileDriver }) =>
    compileDriver === "pdftex_bibtex8" &&
    companion.state === "available" &&
    companion.status?.capabilities.compile.engines.includes("pdflatex") === true
};

export async function compileWithCompanion(
  client: CompanionClient,
  options: LatexCompileOptions
): Promise<CompileResult> {
  options.onStatusChange?.({
    phase: "compiling",
    mode: "worker",
    label: "Compiling with Typr Server",
    detail: `Sending complete project to ${client.baseUrl}`
  });
  const request = createCompanionCompileRequest(options);
  const result = await client.compile(request);
  const metadata = {
    timings: [{ label: "Typr Server execution", durationMs: result.durationMs ?? 0 }],
    strategy: {
      requestedMode: options.compileMode ?? "quick",
      effectiveMode: "full",
      driver: options.compileDriver ?? "pdftex_bibtex8",
      previewKind: "document",
      activeFilePath: options.mainFilePath,
      mainFilePath: request.mainFilePath,
      reason: "Native compilation through Typr Server"
    }
  };
  if (result.ok) {
    return {
      ok: true,
      engine: "companion",
      diagnostics: [],
      output: {
        kind: "pdf",
        content: result.log,
        artifactData: base64ToBytes(result.output.content)
      },
      metadata
    };
  }
  return {
    ok: false,
    engine: "companion",
    errors: result.errors.map(toDiagnostic),
    output: { kind: "placeholder", content: result.log },
    metadata
  };
}

/** Serializes the active document's project-local dependency closure. */
export function createCompanionCompileRequest(options: LatexCompileOptions): CompileRequest {
  const files = collectLatexFiles(options.project, options.mainFilePath, options.source, options.assets ?? []);
  const plan = createLatexCompilePlan(files, options.mainFilePath, "full");
  return {
    protocolVersion: TYPR_COMPANION_PROTOCOL_VERSION,
    engine: "pdflatex",
    mainFilePath: plan.mainFilePath,
    files: serializeProjectFiles(plan.files)
  };
}

export function serializeProjectFiles(files: FileInput[]): ProjectFile[] {
  return files.map(({ path, content }) =>
    typeof content === "string"
      ? { path, kind: "text", content }
      : { path, kind: "binary", encoding: "base64", content: bytesToBase64(content) }
  );
}

export function isCompanionTransportFailure(error: unknown): error is CompanionClientError {
  return error instanceof CompanionClientError && error.kind === "transport";
}

export async function compileLatexWithAutomaticProvider({
  client,
  companion,
  options,
  busyProvider = busyTexProvider,
  onCompanionUnavailable
}: {
  client: CompanionClient;
  companion: CompanionConnectionStatus;
  options: LatexCompileOptions;
  /** Injectable for tests; production uses the existing BusyTeX adapter. */
  busyProvider?: LatexCompilerProvider;
  onCompanionUnavailable?: (error: CompanionClientError) => void;
}): Promise<{ result: CompileResult; provider: LatexCompilerProviderId }> {
  if (selectLatexCompilerProvider({ companion, compileDriver: options.compileDriver ?? "pdftex_bibtex8" }) !== "companion") {
    return { result: await busyProvider.compile(options), provider: "busytex" };
  }

  try {
    return {
      result: await createCompanionProvider(client).compile(options),
      provider: "companion"
    };
  } catch (error) {
    if (error instanceof CompanionClientError && error.kind !== "transport") {
      options.onStatusChange?.({
        phase: "error",
        mode: "worker",
        label: "Typr Server error",
        detail: error.message
      });
      return {
        provider: "companion",
        result: {
          ok: false,
          engine: "companion",
          errors: [{ severity: "error", message: error.message, path: options.mainFilePath }],
          output: { kind: "placeholder", content: error.message }
        }
      };
    }
    if (!isCompanionTransportFailure(error)) {
      throw error;
    }
    onCompanionUnavailable?.(error);
    options.onStatusChange?.({
      phase: "compiling",
      mode: "worker",
      label: "Typr Server unavailable; using BusyTeX",
      detail: error.message
    });
    return { result: await busyProvider.compile(options), provider: "busytex" };
  }
}

function toDiagnostic(error: { code: string; message: string; path?: string; line?: number; column?: number }): CompileDiagnostic {
  return {
    severity: "error",
    message: error.message,
    path: error.path,
    line: error.line,
    column: error.column,
    packageName: error.code
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
