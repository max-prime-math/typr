export async function prepareBrowserForLatexCompile({
  lowMemoryMode,
  persistWorkspace,
  releaseHarperMemory,
  releaseTypstMemory,
  yieldToBrowser
}: {
  lowMemoryMode: boolean;
  persistWorkspace: () => Promise<void>;
  releaseHarperMemory: () => void;
  releaseTypstMemory: () => void;
  yieldToBrowser: () => Promise<void>;
}): Promise<void> {
  if (lowMemoryMode) {
    releaseHarperMemory();
    releaseTypstMemory();
    await yieldToBrowser();
  }

  try {
    await persistWorkspace();
  } catch {
    // The persistence layer reports its own error; compilation may continue.
  }
}
