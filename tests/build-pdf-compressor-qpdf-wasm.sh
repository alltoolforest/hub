#!/usr/bin/env bash
# Task 4 isolated source build. Requires activated Emscripten 3.1.74 and CMake.
# Arguments: private build root containing the pinned source clones; output dir.
set -euo pipefail
build_root=${1:?Pass the private build root}
output_dir=${2:?Pass the experimental output directory}
check_source() {
  local source_dir=$1 expected_sha=$2
  local actual_sha
  actual_sha=$(git -C "$source_dir" rev-parse HEAD)
  test "$actual_sha" = "$expected_sha"
  test -z "$(git -C "$source_dir" status --porcelain --untracked-files=no)"
}
check_source "$build_root/qpdf-source" 4eba95899886e851cc41d76886483b347612f2a8
check_source "$build_root/zlib-source" da607da739fa6047df13e66a2af6b8bec7c2a498
check_source "$build_root/jpeg-source" 9217719d3a58633923b096af4c1d50d304768a64
emcc --version | head -1 | grep -F '3.1.74'
prefix="$build_root/qpdf-wasm-prefix"
mkdir -p "$prefix" "$output_dir"
emcmake cmake -S "$build_root/zlib-source" -B "$build_root/zlib-wasm-build" \
  -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DCMAKE_C_FLAGS='-Oz -flto' -DZLIB_BUILD_TESTING=OFF -DZLIB_BUILD_SHARED=OFF
cmake --build "$build_root/zlib-wasm-build" --target zlibstatic -j 2
cmake --install "$build_root/zlib-wasm-build"
emcmake cmake -S "$build_root/jpeg-source" -B "$build_root/jpeg-wasm-build" \
  -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DCMAKE_C_FLAGS='-Oz -flto' -DENABLE_SHARED=OFF -DENABLE_STATIC=ON \
  -DWITH_SIMD=OFF -DWITH_TURBOJPEG=OFF
cmake --build "$build_root/jpeg-wasm-build" -j 2
cmake --install "$build_root/jpeg-wasm-build"
emcmake cmake -S "$build_root/qpdf-source" -B "$build_root/qpdf-wasm-build" \
  -DCMAKE_PREFIX_PATH="$prefix" -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DCMAKE_CXX_FLAGS='-Oz -flto -fexceptions' \
  -DBUILD_DOC=OFF -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON \
  -DUSE_IMPLICIT_CRYPTO=OFF -DREQUIRE_CRYPTO_NATIVE=ON -DSTATIC_JPEG=ON
cmake --build "$build_root/qpdf-wasm-build" --target libqpdf -j 2
emcc -Oz -flto -fexceptions -std=c++17 \
  "$build_root/qpdf-source/qpdf/qpdf.cc" \
  "$build_root/qpdf-wasm-build/libqpdf/libqpdf.a" \
  -I "$build_root/qpdf-source/include" -I "$build_root/qpdf-wasm-build/include" \
  -I "$prefix/include" -L "$prefix/lib" -lz -ljpeg \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sINITIAL_MEMORY=33554432 \
  -sSTACK_SIZE=2097152 -sDYNAMIC_EXECUTION=0 -sDISABLE_EXCEPTION_CATCHING=0 \
  -sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
  -sINCOMING_MODULE_JS_API='["noInitialRun","locateFile","print","printErr"]' \
  -o "$output_dir/qpdf.mjs"
sha256sum "$output_dir/qpdf.mjs" "$output_dir/qpdf.wasm"
