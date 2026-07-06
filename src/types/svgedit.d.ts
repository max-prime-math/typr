declare module "svgedit" {
  export default class Editor {
    constructor(container?: HTMLElement | null);
    setConfig(config: Record<string, unknown>): void;
    init(): Promise<void> | void;
    loadSvgString(svg: string, options?: { noAlert?: boolean }): void;
    svgCanvas?: {
      bind?: (eventName: string, callback: (...args: unknown[]) => void) => void;
      getSvgString?: () => string;
    };
  }
}

declare module "svgedit/dist/editor/svgedit.css";
