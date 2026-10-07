// node wasm/test-chain.mjs — proves kati.wasm builds a pattern-rule chain
// (.c -> .s -> .o -> game.bin) with recipes run by the host, skips an
// up-to-date tree, and stops on a failing recipe with its error.
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {runKati} from "./out/kati-run.mjs";

let MAKEFILE = `OBJS := a.o b.o
all: game.bin
game.bin: $(OBJS)
\tcat $^ > $@
%.o: %.s
\tcp $< $@
%.s: %.c
\tcp $< $@
broken:
\t@echo before
\tls /no/such/file
\techo never
`;

let dir = fs.mkdtempSync(path.join(os.tmpdir(), "kati-wasm-"));
fs.writeFileSync(path.join(dir, "Makefile"), MAKEFILE);
fs.writeFileSync(path.join(dir, "a.c"), "A\n");
fs.writeFileSync(path.join(dir, "b.c"), "B\n");

async function kati(args) {
  let commands = [];
  let stdout = [];
  let stderr = [];
  let result = await runKati({
    args: ["--no_builtin_rules", ...args],
    cwd: "/work",
    mount(FS, NODEFS) {
      FS.mkdir("/work");
      FS.mount(NODEFS, {root: dir}, "/work");
    },
    runCommand({cmd, cwd, shell, shellflag}) {
      commands.push(cmd);
      let hostCwd = path.join(dir, path.relative("/work", cwd));
      let r = spawnSync(shell, [shellflag, cmd], {cwd: hostCwd, encoding: "utf8"});
      return {status: r.status ?? 128, output: r.stdout + r.stderr};
    },
    print: (line) => stdout.push(line),
    printErr: (line) => stderr.push(line),
  });
  return {...result, commands, stdout: stdout.join("\n"), stderr: stderr.join("\n")};
}

let first = await kati(["all"]);
console.log("run 1:", first.commands);
assert.equal(first.status, 0);
assert.deepEqual(first.commands, [
  "cp a.c a.s", "cp a.s a.o", "cp b.c b.s", "cp b.s b.o", "cat a.o b.o > game.bin",
]);
assert.equal(fs.readFileSync(path.join(dir, "game.bin"), "utf8"), "A\nB\n");

let second = await kati(["all"]);
console.log("run 2:", second.commands, "|", second.stdout);
assert.equal(second.status, 0);
assert.deepEqual(second.commands, []);
assert.match(second.stdout, /Nothing to be done for `all'/);

let failed = await kati(["broken"]);
console.log("run 3: status", failed.status, "|", failed.commands, "|", failed.stdout, "|", failed.stderr);
assert.notEqual(failed.status, 0);
assert.deepEqual(failed.commands, ["echo before", "ls /no/such/file"]);
assert.match(failed.stdout, /No such file/);
assert.match(failed.stderr, /\*\*\* \[broken\] Error/);

fs.rmSync(dir, {recursive: true});
console.log("ok");
