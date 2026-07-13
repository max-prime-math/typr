import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vitest";
import type { DiagramAsset } from "../app/appState";
import type { DiagramEditor } from "./SvgEditDiagramEditor";

type SvgEditDiagramEditorProps = ComponentProps<typeof DiagramEditor>;

type ExpectedSvgEditDiagramEditorProps = {
  diagram: DiagramAsset;
  onClear: () => void;
  onNew: () => void;
  onNewSvg?: (svg: string) => void;
  onSave: () => void;
  onSaveSvg?: (svg: string) => void;
  onInsertIntoDocument: () => void;
  onInsertSvg?: (svg: string) => void;
  onRename: (name: string) => void;
  onDownloadSvg: (svg: string) => void;
  onSvgChange: (svg: string) => void;
};

describe("SvgEditDiagramEditor contract", () => {
  it("exposes only the values and callbacks consumed by the SVG-Edit wrapper", () => {
    expectTypeOf<SvgEditDiagramEditorProps>().toEqualTypeOf<ExpectedSvgEditDiagramEditorProps>();
  });

  it("keeps SVG-string change, new, save, insert, and download callbacks", () => {
    expectTypeOf<SvgEditDiagramEditorProps["onSvgChange"]>().toEqualTypeOf<
      (svg: string) => void
    >();
    expectTypeOf<SvgEditDiagramEditorProps["onNewSvg"]>().toEqualTypeOf<
      ((svg: string) => void) | undefined
    >();
    expectTypeOf<SvgEditDiagramEditorProps["onSaveSvg"]>().toEqualTypeOf<
      ((svg: string) => void) | undefined
    >();
    expectTypeOf<SvgEditDiagramEditorProps["onInsertSvg"]>().toEqualTypeOf<
      ((svg: string) => void) | undefined
    >();
    expectTypeOf<SvgEditDiagramEditorProps["onDownloadSvg"]>().toEqualTypeOf<
      (svg: string) => void
    >();
  });
});
