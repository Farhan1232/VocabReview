#!/usr/bin/env bash
# Builds the Windows app and installer from Linux under Wine, using genuine Windows Python packages.
# Needs: wine, node/npm, curl, unzip, and backend/.venv (only its pip is used, to fetch Windows wheels).
# Usage: packaging/build_on_linux_wine.sh [work-dir]     Output: packaging/dist/
# On a Windows PC use build_windows.ps1 instead.
# Note: Wine may add Inno Setup entries to the Linux app menu. Remove ~/.local/share/applications/wine/Programs/"Inno Setup 6" afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$HOME/.cache/lexis-winbuild}"
PY_VERSION=3.12.10
INNO_VERSION=6.4.3

mkdir -p "$WORK"
export WINEPREFIX="$WORK/prefix" WINEDEBUG=-all WINEARCH=win64 WINEDLLOVERRIDES="mscoree,mshtml=,winemenubuilder.exe="
C="$WINEPREFIX/drive_c"

# Wine needs a terminal for Python's standard streams, hence `script`.
win() { # win <dir> <logfile> <command...>
  (cd "$1" && script -qefc "$3" "$2" >/dev/null) || { sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$2" | tail -30; exit 1; }
}

echo "1/6 Building the frontend"
(cd "$ROOT/frontend" && npm ci --silent && npm test --silent && npm run build --silent)

echo "2/6 Preparing Windows Python $PY_VERSION and Inno Setup $INNO_VERSION"
[ -f "$WORK/python.nupkg" ] || curl -fsSL -o "$WORK/python.nupkg" "https://www.nuget.org/api/v2/package/python/$PY_VERSION"
[ -f "$WORK/innosetup.exe" ] || curl -fsSL -o "$WORK/innosetup.exe" "https://github.com/jrsoftware/issrc/releases/download/is-${INNO_VERSION//./_}/innosetup-$INNO_VERSION.exe"
[ -d "$C" ] || wineboot -i >/dev/null 2>&1
if [ ! -x "$C/Py312/python.exe" ]; then
  rm -rf "$WORK/py" && mkdir -p "$WORK/py" "$C/Py312"
  unzip -qo "$WORK/python.nupkg" -d "$WORK/py" && cp -r "$WORK/py/tools/." "$C/Py312/" && rm -rf "$WORK/py"
fi
[ -f "$C/InnoSetup/ISCC.exe" ] || win "$WORK" "$WORK/inno-install.log" "wine '$(basename "$WORK/innosetup.exe")' /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /ALLUSERS /DIR=C:\\\\InnoSetup"

echo "3/6 Installing Windows packages"
# pip hangs under Wine, so wheels go straight into site-packages. pip evaluates markers for Linux here,
# so packages that are required only on Windows are listed explicitly and uvloop is left out.
grep -v '^uvloop' "$ROOT/backend/requirements.txt" > "$WORK/req.txt"
cat "$ROOT/backend/requirements-dev.txt" >> "$WORK/req.txt"
printf 'pyinstaller\ncolorama\npefile\npywin32-ctypes\n' >> "$WORK/req.txt"
"$ROOT/backend/.venv/bin/python" -m pip install -q --disable-pip-version-check --upgrade \
  --platform win_amd64 --only-binary=:all: --python-version 3.12 --implementation cp \
  --target "$C/Py312/Lib/site-packages" -r "$WORK/req.txt"

echo "4/6 Running backend tests on Windows Python"
rm -rf "$C/src" && mkdir -p "$C/src/frontend" "$C/src/backend"
(cd "$ROOT/backend" && tar --exclude=.venv --exclude=__pycache__ --exclude=.pytest_cache -cf - .) | tar -xf - -C "$C/src/backend"
cp -r "$ROOT/frontend/dist" "$C/src/frontend/"
mkdir -p "$C/src/packaging" && cp "$ROOT"/packaging/{lexis.spec,installer.iss,lexis.ico} "$C/src/packaging/"
win "$C/src/backend" "$WORK/pytest.log" "wine C:/Py312/python.exe -m pytest -q -p no:cacheprovider"
sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$WORK/pytest.log" | grep -E '[0-9]+ passed'

echo "5/6 Packaging Lexis.exe"
win "$C/src/packaging" "$WORK/pyinstaller.log" "wine C:/Py312/python.exe -m PyInstaller --noconfirm --distpath dist --workpath build lexis.spec"
# Wine's own DLLs must never ship: they would not work on real Windows.
if find "$C/src/packaging/dist/Lexis" \( -iname '*.dll' -o -iname '*.pyd' \) -exec grep -alE 'Wine (builtin|placeholder) DLL' {} + | grep .; then
  echo "ERROR: Wine DLLs were bundled (listed above)" >&2; exit 1
fi

echo "6/6 Building the installer"
win "$C/src/packaging" "$WORK/iscc.log" "wine C:/InnoSetup/ISCC.exe /Qp installer.iss"

mkdir -p "$ROOT/packaging/dist" && rm -rf "$ROOT/packaging/dist/Lexis"
cp -r "$C/src/packaging/dist/." "$ROOT/packaging/dist/"
(cd "$ROOT/packaging/dist" && ls -la LexisSetup-*.exe && sha256sum LexisSetup-*.exe)
