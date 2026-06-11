import { useCallback, useEffect, useRef, useState } from "react";
import type { CompilerStatus, CompileResult, TypstCompiler } from "../compiler/types";
import { PreviewPane } from "../preview/PreviewPane";
import {
  convertLatexToTypst,
  type MitexConversionMode
} from "./mitexWasm";
import { convertLatexFallback } from "./latexFallback";

interface MitexPanelProps {
  canInsert: boolean;
  compiler: TypstCompiler;
  compilerStatus: CompilerStatus;
  onInsert: (typstCode: string) => void;
  paperView: boolean;
}

const PREVIEW_COMPILE_DELAY_MS = 180;

export function MitexPanel({
  canInsert,
  compiler,
  compilerStatus,
  onInsert,
  paperView
}: MitexPanelProps) {
  const [mode, setMode] = useState<MitexConversionMode>("math");
  const [latexInput, setLatexInput] = useState("");
  const [typstOutput, setTypstOutput] = useState("");
  const [lastConvertedLatex, setLastConvertedLatex] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [previewResult, setPreviewResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulPreview, setLastSuccessfulPreview] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [isPreviewCompiling, setIsPreviewCompiling] = useState(false);
  const [isErrorSettled, setIsErrorSettled] = useState(false);
  const previewRequestRef = useRef(0);

  const isStale = typstOutput.length > 0 && latexInput !== lastConvertedLatex;

  const handleConvert = useCallback(() => {
    const source = latexInput.trim();

    if (!source) {
      setTypstOutput("");
      setLastConvertedLatex("");
      setFeedback("Add LaTeX before converting.");
      return;
    }

    setIsConverting(true);
    setFeedback("Converting...");
    convertLatexToTypst(source, mode)
      .then((converted) => {
        const finalOutput = converted.trim() || convertLatexFallback(source, mode);
        setTypstOutput(finalOutput);
        setLastConvertedLatex(latexInput);
        setFeedback(
          converted.trim()
            ? "Converted."
            : "MiTeX returned no code; used the basic converter."
        );
      })
      .catch((error) => {
        const fallbackOutput = convertLatexFallback(source, mode);
        const message =
          error instanceof Error
            ? error.message
            : "MiTeX could not convert that snippet.";

        if (fallbackOutput) {
          setTypstOutput(fallbackOutput);
          setLastConvertedLatex(latexInput);
          setFeedback(`MiTeX unavailable; used the basic converter. ${message}`);
          return;
        }

        setTypstOutput(`// MiTeX conversion failed.\n// ${message}`);
        setLastConvertedLatex(latexInput);
        setFeedback(message);
      })
      .finally(() => setIsConverting(false));
  }, [latexInput, mode]);

  const handleCopy = useCallback(() => {
    if (!typstOutput) {
      return;
    }

    if (!navigator.clipboard) {
      setFeedback("Clipboard access is not available in this browser.");
      return;
    }

    navigator.clipboard
      .writeText(typstOutput)
      .then(() => setFeedback("Copied."))
      .catch(() => setFeedback("Copy failed."));
  }, [typstOutput]);

  const handleInsert = useCallback(() => {
    if (!typstOutput || !canInsert) {
      return;
    }

    onInsert(typstOutput);
    setFeedback("Inserted into the current document.");
  }, [canInsert, onInsert, typstOutput]);

  useEffect(() => {
    if (!typstOutput.trim()) {
      previewRequestRef.current += 1;
      setPreviewResult(null);
      setLastSuccessfulPreview(null);
      setIsPreviewCompiling(false);
      return;
    }

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setIsPreviewCompiling(true);

    const timer = window.setTimeout(() => {
      compiler
        .compileDocument(createPreviewSource(typstOutput))
        .then((result) => {
          if (requestId !== previewRequestRef.current) {
            return;
          }

          setPreviewResult(result);
          if (result.ok) {
            setLastSuccessfulPreview(result);
          }
        })
        .catch((error) => {
          if (requestId !== previewRequestRef.current) {
            return;
          }

          setPreviewResult({
            ok: false,
            engine: "typst-ts",
            errors: [
              {
                message:
                  error instanceof Error
                    ? error.message
                    : "Preview compile failed.",
                severity: "error"
              }
            ]
          });
        })
        .finally(() => {
          if (requestId === previewRequestRef.current) {
            setIsPreviewCompiling(false);
          }
        });
    }, PREVIEW_COMPILE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [compiler, typstOutput]);

  useEffect(() => {
    if (!previewResult || previewResult.ok) {
      setIsErrorSettled(false);
      return;
    }

    const timer = window.setTimeout(() => setIsErrorSettled(true), 450);
    return () => window.clearTimeout(timer);
  }, [previewResult]);

  return (
    <div className="mitex-panel">
      <div className="mitex-panel__mode" role="tablist" aria-label="MiTeX conversion mode">
        <button
          aria-selected={mode === "math"}
          className={`mitex-panel__mode-button ${
            mode === "math" ? "mitex-panel__mode-button--active" : ""
          }`}
          onClick={() => setMode("math")}
          role="tab"
          type="button"
        >
          Math
        </button>
        <button
          aria-selected={mode === "text"}
          className={`mitex-panel__mode-button ${
            mode === "text" ? "mitex-panel__mode-button--active" : ""
          }`}
          onClick={() => setMode("text")}
          role="tab"
          type="button"
        >
          Text
        </button>
      </div>

      <label className="mitex-field mitex-field--source">
        <span>LaTeX</span>
        <textarea
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => setLatexInput(event.target.value)}
          placeholder={
            mode === "math"
              ? "\\frac{a^2 + b^2}{c}"
              : "\\section{Title}\nA \\textbf{strong} sentence and $x + y$."
          }
          spellCheck={false}
          value={latexInput}
        />
      </label>

      <button
        className="pane__button mitex-panel__convert"
        disabled={!latexInput.trim() || isConverting}
        onClick={handleConvert}
        type="button"
      >
        {isConverting ? "Converting..." : "Convert to Typst code"}
      </button>

      {feedback ? <p className="mitex-panel__feedback">{feedback}</p> : null}

      <label className="mitex-field mitex-field--output">
        <span>
          Typst code
          {isStale ? <em>Edited since last conversion</em> : null}
        </span>
        <textarea
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => setTypstOutput(event.target.value)}
          placeholder="Converted Typst code appears here."
          spellCheck={false}
          value={typstOutput}
        />
      </label>

      <div className="mitex-panel__actions">
        <button
          className="pane__button pane__button--compact"
          disabled={!typstOutput}
          onClick={handleCopy}
          type="button"
        >
          Copy
        </button>
        <button
          className="pane__button pane__button--compact"
          disabled={!typstOutput || !canInsert}
          onClick={handleInsert}
          type="button"
        >
          Insert
        </button>
      </div>

      <div
        className={`mitex-preview ${paperView ? "mitex-preview--paper" : ""}`}
        aria-label="Converted Typst preview"
      >
        <PreviewPane
          compilerStatus={compilerStatus}
          isCompiling={isPreviewCompiling}
          isErrorSettled={isErrorSettled}
          lastSuccessfulResult={lastSuccessfulPreview}
          paperView={paperView}
          result={previewResult}
          showToolbar={false}
          viewportPadding={0}
        />
      </div>
    </div>
  );
}

function createPreviewSource(source: string): string {
  return `#set page(width: auto, height: auto, margin: 8pt)\n${source}`;
}
