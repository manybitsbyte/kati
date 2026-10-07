#!/bin/sh
# Builds ckati to WebAssembly: wasm/out/kati.mjs + wasm/out/kati.wasm.
# Recipes do not fork: they are handed to the host's Module.runCommand.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/../src"
OUT="$HERE/out"
OBJ="$OUT/obj"
mkdir -p "$OBJ"

VERSION=$(git -C "$HERE/.." rev-parse HEAD 2>/dev/null || echo unknown)
printf 'const char* kGitVersion = "%s";\n' "$VERSION" > "$OBJ/version.cc"

SRCS="affinity command dep eval exec expr file file_cache fileutil find flags
func io log main ninja parser regen regen_dump rule stats stmt stringprintf
strutil symtab timeutil var"

CXXFLAGS="-std=c++17 -O2 -DNOLOG -W -Wall -Wno-unused-parameter"
OBJS=""
PIDS=""
for f in $SRCS; do
  o="$OBJ/$f.o"
  em++ $CXXFLAGS -c "$SRC/$f.cc" -o "$o" &
  PIDS="$PIDS $!"
  OBJS="$OBJS $o"
done
em++ $CXXFLAGS -c "$OBJ/version.cc" -o "$OBJ/version.o"
for p in $PIDS; do
  wait "$p"
done
OBJS="$OBJS $OBJ/version.o"

em++ -O2 $OBJS -o "$OUT/kati.mjs" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createKati \
  -sENVIRONMENT=web,worker,node \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
  -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=1048576 \
  -sSTACK_SIZE=4194304 -sALLOW_MEMORY_GROWTH=1 \
  -sFORCE_FILESYSTEM=1 -lnodefs.js \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS,NODEFS
cp "$HERE/kati-run.mjs" "$OUT/kati-run.mjs"
echo "built $OUT/kati.mjs $OUT/kati.wasm"
