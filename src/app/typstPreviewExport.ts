import { normalizeTypstCompilerPath } from "../compiler/typstAssets";
import { exportTypstPdf } from "../compiler/typstRuntime";
import type { CompileAssetFile } from "../compiler/types";
import { listProjectEntries, type TyprProjectRepository } from "../project/projectState";

const TEXT_ENCODER = new TextEncoder();

export function buildTypstProjectShadowFiles(
  project: TyprProjectRepository | null,
  mainFilePath: string,
  mainSource: string
): CompileAssetFile[] {
  const assets = new Map<string, CompileAssetFile>();
  const normalizedMainFilePath = normalizeTypstCompilerPath(mainFilePath);

  if (project) {
    for (const entry of listProjectEntries(project)) {
      if (entry.kind !== "file") {
        continue;
      }

      const path = normalizeTypstCompilerPath(entry.path);
      assets.set(path, {
        path,
        content: typeof entry.content === "string" ? TEXT_ENCODER.encode(entry.content) : entry.content
      });
    }
  }

  assets.set(normalizedMainFilePath, {
    path: normalizedMainFilePath,
    content: TEXT_ENCODER.encode(mainSource)
  });

  return [...assets.values()];
}

export function exportTypstPreviewPdf({
  activePreviewCompileSourcePath,
  assets = [],
  project,
  source,
  sourcePath
}: {
  activePreviewCompileSourcePath: string | null;
  assets?: CompileAssetFile[];
  project: TyprProjectRepository | null;
  source: string;
  sourcePath: string;
}): Promise<Uint8Array> {
  const mainFilePath = activePreviewCompileSourcePath ?? sourcePath;

  return exportTypstPdf(
    source,
    [...buildTypstProjectShadowFiles(project, mainFilePath, source), ...assets],
    { mainFilePath }
  );
}
