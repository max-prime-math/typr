import { describe, expect, it } from "vitest";
import { extractTypstPackageReferencesFromCompileInputs } from "./typstPackages";

describe("typst package extraction", () => {
  it("finds package imports inside text shadow assets", () => {
    const references = extractTypstPackageReferencesFromCompileInputs(
      '#include "figures/graph 1.typ"',
      [
        {
          path: "/figures/graph 1.typ",
          content: new TextEncoder().encode(
            '#import "@preview/simple-plot:0.8.0": plot'
          )
        }
      ]
    );

    expect(references).toEqual([
      {
        namespace: "preview",
        name: "simple-plot",
        version: "0.8.0",
        key: "preview/simple-plot:0.8.0"
      }
    ]);
  });
});
