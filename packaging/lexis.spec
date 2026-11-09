# PyInstaller spec — run from packaging/build_windows.ps1 (on Windows).
from PyInstaller.utils.hooks import collect_submodules, copy_metadata

root = SPECPATH + "/../backend"
a = Analysis(
    [root + "/lexis_launcher.py"],
    pathex=[root],
    datas=[
        (root + "/migrations", "migrations"),
        (SPECPATH + "/../frontend/dist", "web"),
        *copy_metadata("fsrs"),
    ],
    hiddenimports=[*collect_submodules("uvicorn"), *collect_submodules("app"), "alembic", "sqlalchemy.dialects.sqlite"],
    excludes=["tkinter", "pytest"],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Lexis", icon=SPECPATH + "/lexis.ico", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="Lexis")
