import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import {
  createTypstCompiler,
  type CompileResult,
  type CompilerStatus
} from "../compiler/typstCompiler";
import type { CompileAssetFile } from "../compiler/types";
import {
  getSourceLanguage,
  type SourceLanguage
} from "../compiler/sourceFileTypes";
import { cancelLatexCompile } from "../compiler/latexCompiler";
import { normalizeWorkspacePath } from "../workspace/workspaceTree";
import {
  createCompilePreviewState,
  type CompilePreviewState
} from "./compilePreviewState";

interface UseCompilePreviewControllerOptions<CompileTrigger extends string> {
  initialTrigger: CompileTrigger;
  onCompilerStatusChange?: (status: CompilerStatus) => void;
}

export interface CompilePreviewController<CompileTrigger extends string> {
  compiler: ReturnType<typeof createTypstCompiler>;
  compilerStatus: CompilerStatus;
  setCompilerStatus: React.Dispatch<React.SetStateAction<CompilerStatus>>;
  handleCompilerStatusChange: (status: CompilerStatus) => void;
  compileResult: CompileResult | null;
  setCompileResult: React.Dispatch<React.SetStateAction<CompileResult | null>>;
  lastSuccessfulResult: Extract<CompileResult, { ok: true }> | null;
  setLastSuccessfulResult: React.Dispatch<
    React.SetStateAction<Extract<CompileResult, { ok: true }> | null>
  >;
  compilePreviewsByPath: Record<string, CompilePreviewState>;
  setCompilePreviewsByPath: React.Dispatch<
    React.SetStateAction<Record<string, CompilePreviewState>>
  >;
  isCompiling: boolean;
  setIsCompiling: React.Dispatch<React.SetStateAction<boolean>>;
  compileTimerRef: MutableRefObject<number | null>;
  compileFrameRef: MutableRefObject<number | null>;
  compileRequestRef: MutableRefObject<number>;
  pendingSourceRef: MutableRefObject<string>;
  pendingSourcePathRef: MutableRefObject<string>;
  activeSourcePathRef: MutableRefObject<string>;
  activeSourceLanguageRef: MutableRefObject<SourceLanguage>;
  isActiveSourceCompilableRef: MutableRefObject<boolean>;
  previewSourceDraftRef: MutableRefObject<string>;
  diagramAssetsRevisionRef: MutableRefObject<string>;
  diagramAssetsRef: MutableRefObject<CompileAssetFile[]>;
  compileResultRef: MutableRefObject<CompileResult | null>;
  readyTypstPreviewSignatureRef: MutableRefObject<string | null>;
  compileInFlightRef: MutableRefObject<boolean>;
  compileInFlightLanguageRef: MutableRefObject<SourceLanguage | null>;
  compileInFlightSourceRef: MutableRefObject<string>;
  compileInFlightSourcePathRef: MutableRefObject<string>;
  compileInFlightDiagramRevisionRef: MutableRefObject<string>;
  pendingCompileTriggerRef: MutableRefObject<CompileTrigger>;
  isMountedRef: MutableRefObject<boolean>;
  clearScheduledCompile: () => void;
  scheduleCompileAfterPaint: (runCompile: () => void | Promise<void>, delayMs: number) => void;
  queueCompile: (options: {
    debounceMs: number;
    debounced: boolean;
    diagramRevision: string;
    runCompile: () => void | Promise<void>;
    source: string;
    sourcePath: string;
  }) => void;
  hasActiveCompileWork: () => boolean;
  applyRestoredCompilePreview: (options: {
    result: Extract<CompileResult, { ok: true }>;
    sourcePaths: string[];
    statusLabel: string;
    typstSignature?: string;
  }) => void;
}

export function useCompilePreviewController<CompileTrigger extends string>({
  initialTrigger,
  onCompilerStatusChange
}: UseCompilePreviewControllerOptions<CompileTrigger>): CompilePreviewController<CompileTrigger> {
  const compileTimerRef = useRef<number | null>(null);
  const compileFrameRef = useRef<number | null>(null);
  const compileRequestRef = useRef(0);
  const pendingSourceRef = useRef("");
  const pendingSourcePathRef = useRef("main.typ");
  const activeSourcePathRef = useRef("main.typ");
  const activeSourceLanguageRef = useRef<SourceLanguage>("typst");
  const isActiveSourceCompilableRef = useRef(true);
  const previewSourceDraftRef = useRef("");
  const diagramAssetsRevisionRef = useRef("");
  const diagramAssetsRef = useRef<CompileAssetFile[]>([]);
  const compileResultRef = useRef<CompileResult | null>(null);
  const readyTypstPreviewSignatureRef = useRef<string | null>(null);
  const compileInFlightRef = useRef(false);
  const compileInFlightLanguageRef = useRef<SourceLanguage | null>(null);
  const compileInFlightSourceRef = useRef("");
  const compileInFlightSourcePathRef = useRef("");
  const compileInFlightDiagramRevisionRef = useRef("");
  const pendingCompileTriggerRef = useRef<CompileTrigger>(initialTrigger);
  const isMountedRef = useRef(true);
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus>({
    phase: "idle",
    mode: "worker",
    label: "Waiting to compile"
  });
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [compilePreviewsByPath, setCompilePreviewsByPath] = useState<
    Record<string, CompilePreviewState>
  >({});
  const [isCompiling, setIsCompiling] = useState(false);

  const handleCompilerStatusChange = useCallback(
    (status: CompilerStatus) => {
      setCompilerStatus(status);
      onCompilerStatusChange?.(status);
    },
    [onCompilerStatusChange]
  );
  const compiler = useMemo(
    () => createTypstCompiler({ onStatusChange: handleCompilerStatusChange }),
    [handleCompilerStatusChange]
  );

  const clearScheduledCompile = useCallback(() => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }
    if (compileFrameRef.current !== null) {
      window.cancelAnimationFrame(compileFrameRef.current);
      compileFrameRef.current = null;
    }
  }, []);

  const scheduleCompileAfterPaint = useCallback(
    (runCompile: () => void | Promise<void>, delayMs: number) => {
      clearScheduledCompile();
      compileFrameRef.current = window.requestAnimationFrame(() => {
        compileFrameRef.current = null;
        compileTimerRef.current = window.setTimeout(() => {
          compileTimerRef.current = null;
          void runCompile();
        }, delayMs);
      });
    },
    [clearScheduledCompile]
  );

  const queueCompile = useCallback(
    ({
      debounceMs,
      debounced,
      diagramRevision,
      runCompile,
      source,
      sourcePath
    }: {
      debounceMs: number;
      debounced: boolean;
      diagramRevision: string;
      runCompile: () => void | Promise<void>;
      source: string;
      sourcePath: string;
    }) => {
      clearScheduledCompile();

      const sourceLanguage = getSourceLanguage(sourcePath);
      const sourcePathKey = normalizeWorkspacePath(sourcePath);
      const inFlightSourcePathKey = normalizeWorkspacePath(
        compileInFlightSourcePathRef.current
      );
      const isQueuedBehindAnotherCompile = Boolean(
        compileInFlightRef.current &&
          sourcePathKey &&
          inFlightSourcePathKey &&
          sourcePathKey !== inFlightSourcePathKey
      );

      pendingSourcePathRef.current = sourcePath;
      pendingSourceRef.current = source;
      const nextCompilerStatus: CompilerStatus = {
        phase: "compiling",
        mode: "worker",
        label: isQueuedBehindAnotherCompile
          ? sourceLanguage === "latex"
            ? "Queued LaTeX compile"
            : "Queued compile"
          : sourceLanguage === "latex"
            ? "Compiling LaTeX"
            : "Compiling"
      };
      setIsCompiling(true);
      if (!isQueuedBehindAnotherCompile) {
        setCompilerStatus(nextCompilerStatus);
      }
      setCompilePreviewsByPath((currentPreviews) => {
        const currentPreview =
          currentPreviews[sourcePathKey] ?? createCompilePreviewState(sourcePathKey);

        return {
          ...currentPreviews,
          [sourcePathKey]: {
            ...currentPreview,
            compilerStatus: {
              ...nextCompilerStatus,
              mode: currentPreview.compilerStatus.mode
            },
            isCompiling: true
          }
        };
      });

      if (compileInFlightRef.current) {
        const shouldCancelInFlightLatexCompile =
          compileInFlightLanguageRef.current === "latex" &&
          compileInFlightSourcePathRef.current === sourcePath &&
          (compileInFlightSourceRef.current !== source ||
            compileInFlightDiagramRevisionRef.current !== diagramRevision);

        if (shouldCancelInFlightLatexCompile) {
          compileRequestRef.current += 1;
          setCompilerStatus({
            phase: "compiling",
            mode: "worker",
            label: "Cancelling stale LaTeX compile",
            detail: "A newer edit is ready; stopping the current BusyTeX worker"
          });
          cancelLatexCompile();
        }

        return;
      }

      scheduleCompileAfterPaint(runCompile, debounced ? debounceMs : 0);
    },
    [clearScheduledCompile, scheduleCompileAfterPaint]
  );

  const hasActiveCompileWork = useCallback(
    () =>
      compileInFlightRef.current ||
      compileFrameRef.current !== null ||
      compileTimerRef.current !== null,
    []
  );

  const applyRestoredCompilePreview = useCallback(
    ({
      result,
      sourcePaths,
      statusLabel,
      typstSignature
    }: {
      result: Extract<CompileResult, { ok: true }>;
      sourcePaths: string[];
      statusLabel: string;
      typstSignature?: string;
    }) => {
      const readyStatus: CompilerStatus = {
        phase: "ready",
        mode: "worker",
        label: statusLabel
      };

      compileResultRef.current = result;
      if (typstSignature !== undefined) {
        readyTypstPreviewSignatureRef.current = typstSignature;
      }
      setIsCompiling(false);
      setCompileResult(result);
      setLastSuccessfulResult(result);
      setCompilerStatus(readyStatus);
      setCompilePreviewsByPath((currentPreviews) => {
        const nextPreviews = { ...currentPreviews };

        for (const sourcePath of sourcePaths) {
          const normalizedSourcePath = normalizeWorkspacePath(sourcePath);

          if (!normalizedSourcePath) {
            continue;
          }

          nextPreviews[normalizedSourcePath] = createCompilePreviewState(
            normalizedSourcePath,
            {
              result,
              lastSuccessfulResult: result,
              compilerStatus: readyStatus,
              isCompiling: false
            }
          );
        }

        return nextPreviews;
      });
    },
    []
  );

  useEffect(() => {
    compileResultRef.current = compileResult;
  }, [compileResult]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearScheduledCompile();
      compiler.dispose();
    };
  }, [clearScheduledCompile, compiler]);

  return {
    compiler,
    compilerStatus,
    setCompilerStatus,
    handleCompilerStatusChange,
    compileResult,
    setCompileResult,
    lastSuccessfulResult,
    setLastSuccessfulResult,
    compilePreviewsByPath,
    setCompilePreviewsByPath,
    isCompiling,
    setIsCompiling,
    compileTimerRef,
    compileFrameRef,
    compileRequestRef,
    pendingSourceRef,
    pendingSourcePathRef,
    activeSourcePathRef,
    activeSourceLanguageRef,
    isActiveSourceCompilableRef,
    previewSourceDraftRef,
    diagramAssetsRevisionRef,
    diagramAssetsRef,
    compileResultRef,
    readyTypstPreviewSignatureRef,
    compileInFlightRef,
    compileInFlightLanguageRef,
    compileInFlightSourceRef,
    compileInFlightSourcePathRef,
    compileInFlightDiagramRevisionRef,
    pendingCompileTriggerRef,
    isMountedRef,
    clearScheduledCompile,
    scheduleCompileAfterPaint,
    queueCompile,
    hasActiveCompileWork,
    applyRestoredCompilePreview
  };
}
