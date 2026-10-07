// Runs kati once in a fresh WebAssembly instance.
//
//   runKati({
//     args: ["all"],                 // kati command line (no argv[0])
//     cwd: "/work",                  // directory kati runs in
//     mount(FS, NODEFS) { ... },     // host puts its files under the kati FS
//     runCommand({cmd, cwd, shell, shellflag, stderr}) -> {status, output},
//     print(line), printErr(line),   // kati's own stdout / stderr
//   }) -> Promise<{status}>
//
// kati's global state is per instance, so every run gets a new one.
import createKati from "./kati.mjs";

export async function runKati(opts) {
  let host = globalThis.process;
  let hostExitCode = host?.exitCode;
  let done;
  let finished = new Promise((resolve) => {
    done = (result) => {
      queueMicrotask(() => {
        if (host) {
          host.exitCode = hostExitCode;
        }
        resolve(result);
      });
    };
  });
  let module = await createKati({
    noInitialRun: true,
    runCommand: opts.runCommand,
    print: opts.print || ((line) => console.log(line)),
    printErr: opts.printErr || ((line) => console.error(line)),
    onExit: (status) => done({status}),
    onAbort: (what) => done({status: 2, abort: String(what)}),
  });
  if (opts.mount) {
    await opts.mount(module.FS, module.NODEFS, module);
  }
  if (opts.cwd) {
    module.FS.chdir(opts.cwd);
  }
  try {
    module.callMain(opts.args || []);
  } catch (e) {
    if (e && e.name === "ExitStatus") {
      done({status: e.status});
    } else {
      done({status: 2, abort: String(e && e.stack || e)});
    }
  }
  return finished;
}
