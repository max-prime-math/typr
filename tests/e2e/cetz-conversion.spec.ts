import { expect, test } from "@playwright/test";

test("pinned Tylax converts TikZ and the generated CeTZ compiles", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-typr-app-ready", "true");

  const conversion = await page.evaluate(async () => {
    const { convertTikzToCetz } = await import(
      "/src/diagram/tylaxWorkerClient.ts"
    );

    return convertTikzToCetz(String.raw`\begin{tikzpicture}
  \draw (0, 0) -- (1, 1);
\end{tikzpicture}`);
  });

  expect(conversion.version).toBe("0.3.7");
  expect(conversion.diagnostics).toMatchObject({
    errors: [],
    warnings: [],
    has_errors: false
  });
  expect(conversion.cetz).toContain('@preview/cetz:0.3.4');
  expect(conversion.cetz).toContain("line((0, 0), (1, 1))");

  const compileResult = await page.evaluate(async (cetz) => {
    const [
      { buildCetzValidationSource },
      { compareDiagramSvgs },
      { createTypstCompiler }
    ] =
      await Promise.all([
        import("/src/diagram/cetzConversion.ts"),
        import("/src/diagram/cetzVisualValidation.ts"),
        import("/src/compiler/typstCompiler.ts")
      ]);
    const compiler = createTypstCompiler();

    try {
      const result = await compiler.compileDocument(
        buildCetzValidationSource(cetz),
        [],
        { mainFilePath: "figures/e2e.cetz.typ" }
      );

      const visualComparison =
        result.ok && result.output.kind === "svg"
          ? await compareDiagramSvgs(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
              '<line x1="10" y1="90" x2="90" y2="10" stroke="black" stroke-width="2"/>' +
              "</svg>",
              result.output.content
            )
          : null;
      const includeResult = await compiler.compileDocument(
        '#figure(include "figures/e2e.cetz.typ")',
        [{
          path: "figures/e2e.cetz.typ",
          content: new TextEncoder().encode(cetz)
        }],
        { mainFilePath: "main.typ" }
      );

      return {
        engine: result.engine,
        includeEngine: includeResult.engine,
        includeKind: includeResult.ok ? includeResult.output.kind : null,
        includeOk: includeResult.ok,
        kind: result.ok ? result.output.kind : null,
        ok: result.ok,
        visualComparison,
        messages: result.ok
          ? result.diagnostics.map((diagnostic) => diagnostic.message)
          : result.errors.map((diagnostic) => diagnostic.message)
      };
    } finally {
      compiler.dispose();
    }
  }, conversion.cetz);

  expect(compileResult).toMatchObject({
    engine: "typst-ts",
    includeEngine: "typst-ts",
    includeKind: "svg",
    includeOk: true,
    kind: "svg",
    ok: true,
    visualComparison: {
      similar: true
    }
  });
});
