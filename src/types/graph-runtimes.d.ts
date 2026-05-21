declare module "plotly.js-dist-min" {
  interface PlotlyFigureConfig {
    responsive?: boolean;
    displayModeBar?: boolean;
    [key: string]: unknown;
  }

  interface PlotlyFigureLayout {
    [key: string]: unknown;
  }

  interface PlotlyFigureData {
    [key: string]: unknown;
  }

  interface PlotlyModule {
    newPlot(
      container: HTMLElement,
      data: PlotlyFigureData[],
      layout?: PlotlyFigureLayout,
      config?: PlotlyFigureConfig
    ): Promise<unknown>;
    toImage(
      container: HTMLElement,
      options: { format: "svg" | "png"; width?: number; height?: number }
    ): Promise<string>;
    purge(container: HTMLElement): void;
  }

  const plotly: PlotlyModule;
  export default plotly;
}

declare module "gnuplot-wasm" {
  interface GnuplotResult {
    render(script: string): { svg: string };
  }

  interface GnuplotOptions {
    locateFile?: (fileName: string) => string;
  }

  type GnuplotFactory = (options?: GnuplotOptions) => Promise<GnuplotResult>;

  const gnuplot: GnuplotFactory;
  export default gnuplot;
}
