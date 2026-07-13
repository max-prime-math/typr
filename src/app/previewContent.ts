import { readProjectFileBytes, type TyprProjectRepository } from "../project/projectState";
import { normalizeWorkspacePath, type WorkspaceTreeNode } from "../workspace/workspaceTree";

export function resolvePreviewTextContent({
  activePreviewPath,
  activeSourceContent,
  activeSourcePath,
  isTextPreview,
  previewNode,
  project
}: {
  activePreviewPath: string | null;
  activeSourceContent: string;
  activeSourcePath: string;
  isTextPreview: boolean;
  previewNode: WorkspaceTreeNode | null;
  project: TyprProjectRepository | null;
}): string {
  const previewPath = normalizeWorkspacePath(activePreviewPath ?? "");

  if (!previewPath) {
    return "";
  }

  if (previewPath === normalizeWorkspacePath(activeSourcePath)) {
    return activeSourceContent;
  }

  if (isTextPreview && project) {
    const projectBytes = readProjectFileBytes(project, previewPath);

    if (projectBytes) {
      return new TextDecoder().decode(projectBytes);
    }
  }

  return decodePreviewNodeTextContent(previewNode?.content, isTextPreview) ?? "";
}

function decodePreviewNodeTextContent(
  content: string | Uint8Array | undefined,
  allowBinaryTextDecode: boolean
): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (allowBinaryTextDecode && content instanceof Uint8Array) {
    return new TextDecoder().decode(content);
  }

  return null;
}
