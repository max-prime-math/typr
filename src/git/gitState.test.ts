import { describe, expect, it } from "vitest";
import {
  createEmptyGitManagedProject,
  normalizeGitWorkspaceState,
  type GitWorkspaceState
} from "./gitState";

describe("gitState", () => {
  it("keeps selected managed repos scoped to their owning Typr project", () => {
    const algebraRepo = createEmptyGitManagedProject({
      projectId: "project-algebra",
      projectName: "Algebra"
    });
    const geometryRepo = createEmptyGitManagedProject({
      projectId: "project-geometry",
      projectName: "Geometry"
    });
    const workspace: GitWorkspaceState = {
      version: 2,
      selectedProjectId: geometryRepo.id,
      selectedProjectIdsByTyprProjectId: {
        "project-algebra": algebraRepo.id,
        "project-geometry": geometryRepo.id
      },
      projects: [algebraRepo, geometryRepo]
    };

    const normalized = normalizeGitWorkspaceState(workspace, {
      projectId: "project-algebra",
      projectName: "Algebra"
    });

    expect(normalized.selectedProjectId).toBe(algebraRepo.id);
    expect(normalized.selectedProjectIdsByTyprProjectId["project-geometry"]).toBe(geometryRepo.id);
  });

  it("migrates legacy global selection without leaking it into another project", () => {
    const algebraRepo = createEmptyGitManagedProject({
      projectId: "project-algebra",
      projectName: "Algebra"
    });
    const legacyWorkspace = {
      version: 1,
      selectedProjectId: algebraRepo.id,
      projects: [algebraRepo]
    };

    const normalized = normalizeGitWorkspaceState(legacyWorkspace as GitWorkspaceState, {
      projectId: "project-geometry",
      projectName: "Geometry"
    });

    expect(normalized.selectedProjectId).toBe(null);
    expect(normalized.selectedProjectIdsByTyprProjectId["project-geometry"]).toBe(null);
  });
});
