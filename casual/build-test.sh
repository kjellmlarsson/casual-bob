#!/bin/sh
# Builds and runs the unit test for catfacts.fact.h. Needs g++ (C++23) and gtest. No network, no Casual.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
out="${TMPDIR:-/tmp}/catfacts-fact-test"

${CXX:-g++} -std=c++23 -Wall -Wextra \
   -I"$here/src" -I"$here/third_party" \
   "$here/test/catfacts.fact.test.cpp" \
   $(pkg-config --cflags --libs gtest_main) \
   -o "$out"

"$out"
