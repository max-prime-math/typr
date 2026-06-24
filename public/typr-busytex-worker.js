let pipeline = null;
const projectFiles = new Map();

function toBusyTexFiles() {
  return Array.from(projectFiles.entries()).map(([path, contents]) => ({ path, contents }));
}

function applyProjectFileSync(changedFiles, deletedPaths) {
  for (const path of deletedPaths || []) {
    projectFiles.delete(path);
  }

  for (const file of changedFiles || []) {
    projectFiles.set(file.path, file.contents);
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.busytex_pipeline_js) {
      importScripts(data.busytex_pipeline_js);
      pipeline = new BusytexPipeline(
        data.busytex_js,
        data.busytex_wasm,
        data.data_packages_js,
        data.preload_data_packages_js,
        data.texmf_local,
        (message) => postMessage({ print: message }),
        (appletVersions) => postMessage({ initialized: appletVersions }),
        data.preload,
        BusytexPipeline.ScriptLoaderWorker
      );
      return;
    }

    if (!pipeline) {
      postMessage({ exception: "BusyTeX pipeline is not initialized." });
      return;
    }

    if (data.reset_project_files) {
      projectFiles.clear();
      postMessage({ project_files_reset: true });
      return;
    }

    if (data.read_project_files) {
      postMessage({
        project_files: await pipeline.read_project_files(data.read_project_files.dir || null)
      });
      return;
    }

    if (data.write_texlive_remote_files) {
      await pipeline.write_texlive_remote_files(data.write_texlive_remote_files);
      postMessage({ texlive_remote_written: true });
      return;
    }

    if (data.write_texlive_remote_misses) {
      await pipeline.write_texlive_remote_misses(data.write_texlive_remote_misses);
      postMessage({ texlive_remote_misses_written: true });
      return;
    }

    if (data.compile_project) {
      const syncStartedAt = performance.now();
      applyProjectFileSync(data.changed_files, data.deleted_paths);
      const syncFinishedAt = performance.now();
      const compileFiles = toBusyTexFiles();
      const compileStartedAt = performance.now();
      const result = await pipeline.compile(
        compileFiles,
        data.main_tex_path,
        data.bibtex,
        data.makeindex,
        data.rerun,
        data.verbose,
        data.driver,
        data.data_packages_js,
        data.remote_endpoint
      );
      const compileFinishedAt = performance.now();

      postMessage({
        ...result,
        typr_stats: {
          changedFiles: data.changed_files?.length || 0,
          deletedFiles: data.deleted_paths?.length || 0,
          cachedFiles: projectFiles.size,
          compileFiles: compileFiles.length,
          syncMs: syncFinishedAt - syncStartedAt,
          texMs: compileFinishedAt - compileStartedAt
        }
      });
    }
  } catch (error) {
    postMessage({
      exception:
        "Exception in Typr BusyTeX worker: " +
        (error && error.toString ? error.toString() : String(error)) +
        "\nStack:\n" +
        (error && error.stack ? error.stack : "")
    });
  }
};
