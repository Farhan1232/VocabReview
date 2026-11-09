; Inno Setup 6 script — per-user install, no admin rights needed. Data lives in %LOCALAPPDATA%\Lexis
; and is NOT touched by install, update or uninstall.
#define AppVersion "1.0.4"
[Setup]
AppId={{6C7A2B44-1F7D-4E0B-9C1D-5A3E0B7C1D01}
AppName=Lexis
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Lexis
DefaultGroupName=Lexis
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=LexisSetup-{#AppVersion}
SetupIconFile=lexis.ico
UninstallDisplayIcon={app}\Lexis.exe
Compression=lzma2
SolidCompression=yes
CloseApplications=yes

[Files]
Source: "dist\Lexis\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\Lexis"; Filename: "{app}\Lexis.exe"
Name: "{group}\Lexis data folder"; Filename: "{localappdata}\Lexis"
Name: "{userdesktop}\Lexis"; Filename: "{app}\Lexis.exe"

[Run]
Filename: "{app}\Lexis.exe"; Description: "Start Lexis now"; Flags: postinstall nowait skipifsilent
