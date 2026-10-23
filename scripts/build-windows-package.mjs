import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const packageInfo = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const architecture = process.arch === "x64" ? "x64" : process.arch;
const artifactName = `Mowen-Nibi-Workbench-${packageInfo.version}-${buildDate}-windows-${architecture}`;
const releaseDir = path.join(root, "release");
const stagingDir = path.join(releaseDir, artifactName);
const payloadDir = path.join(stagingDir, "payload");
const zipPath = path.join(releaseDir, `${artifactName}.zip`);
const zipChecksumPath = `${zipPath}.sha256.txt`;
const setupPath = path.join(releaseDir, `${artifactName}-Setup.exe`);
const setupChecksumPath = `${setupPath}.sha256.txt`;

await assertDirectory(path.join(root, "dist"), "dist 不存在，请先运行 npm run build:static");
await rm(stagingDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await rm(zipChecksumPath, { force: true });
await rm(setupPath, { force: true });
await rm(setupChecksumPath, { force: true });
await mkdir(payloadDir, { recursive: true });

await cp(path.join(root, "dist"), path.join(payloadDir, "app"), { recursive: true });
await cp(path.join(root, "server", "src"), path.join(payloadDir, "server", "src"), { recursive: true });
await cp(path.join(root, "server", "migrations"), path.join(payloadDir, "server", "migrations"), { recursive: true });
await cp(
  path.join(root, "scripts", "windows-installer", "launcher-health.mjs"),
  path.join(payloadDir, "launcher-health.mjs"),
);
await cp(process.execPath, path.join(payloadDir, "node.exe"));
await cp(path.join(root, "LICENSE"), path.join(payloadDir, "LICENSE.txt"));
await copyProductionDependencies(payloadDir);

await writeFile(path.join(payloadDir, "package.json"), JSON.stringify({
  name: packageInfo.name,
  version: packageInfo.version,
  private: true,
  type: "module",
}, null, 2));
await writeFile(path.join(payloadDir, "launcher.mjs"), buildLauncher(), "utf8");
await writeFile(path.join(payloadDir, "启动工作台.vbs"), withUtf16LeBom(buildVbsLauncher()));
await writeFile(path.join(payloadDir, "停止工作台.cmd"), buildStopScript(), "utf8");
await writeFile(path.join(payloadDir, "VERSION.txt"), `${packageInfo.version}\n${buildDate}\n`, "utf8");

await writeFile(path.join(stagingDir, "安装摹文拟笔工作台.cmd"), buildInstallerCmd(), "utf8");
await writeFile(path.join(stagingDir, "install.ps1"), withUtf8Bom(buildInstallerPowerShell()));
await writeFile(path.join(stagingDir, "卸载摹文拟笔工作台.cmd"), buildUninstallerCmd(), "utf8");
await writeFile(path.join(stagingDir, "uninstall.ps1"), withUtf8Bom(buildUninstallerPowerShell()));
await writeFile(path.join(stagingDir, "安装说明.txt"), withUtf8Bom(buildInstallReadme()));

const packagedFiles = await listFiles(stagingDir);
const manifest = {
  product: "摹文拟笔工作台",
  package: artifactName,
  version: packageInfo.version,
  buildDate,
  architecture,
  runtime: path.basename(process.execPath),
  fileCount: packagedFiles.length + 1,
  generatedAt: new Date().toISOString(),
};
await writeFile(path.join(stagingDir, "package-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

const allFiles = await listFiles(stagingDir);
const zip = new JSZip();
for (const filePath of allFiles) {
  const relativePath = path.relative(releaseDir, filePath).split(path.sep).join("/");
  zip.file(relativePath, await readFile(filePath));
}
const archive = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
  streamFiles: true,
});
await writeFile(zipPath, archive);

const archiveHash = createHash("sha256").update(archive).digest("hex");
await writeFile(zipChecksumPath, `${archiveHash}  ${path.basename(zipPath)}\n`, "utf8");
const setupArtifact = await buildSingleFileInstaller(zipPath, setupPath, setupChecksumPath);

console.log(JSON.stringify({
  ok: true,
  stagingDir,
  zipPath,
  checksumPath: zipChecksumPath,
  sha256: archiveHash,
  bytes: archive.length,
  fileCount: allFiles.length,
  setupPath: setupArtifact?.path || null,
  setupChecksumPath: setupArtifact?.checksumPath || null,
  setupSha256: setupArtifact?.sha256 || null,
  setupBytes: setupArtifact?.bytes || null,
}, null, 2));

async function buildSingleFileInstaller(sourceZipPath, installerPath, checksumPath) {
  if (process.platform !== "win32") return null;
  const windowsRoot = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windowsRoot, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windowsRoot, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  let compilerPath = "";
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        compilerPath = candidate;
        break;
      }
    } catch {
      // Try the next framework compiler location.
    }
  }
  if (!compilerPath) {
    throw new Error("未找到 Windows .NET Framework C# 编译器，无法生成单文件 Setup.exe");
  }

  const sourcePath = path.join(root, "scripts", "windows-installer", "Installer.cs");
  try {
    execFileSync(compilerPath, [
      "/nologo",
      "/target:winexe",
      "/platform:x64",
      "/optimize+",
      `/out:${installerPath}`,
      `/resource:${sourceZipPath},MowenNibi.Package.zip`,
      "/reference:System.Windows.Forms.dll",
      "/reference:System.Drawing.dll",
      "/reference:System.IO.Compression.dll",
      sourcePath,
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    throw new Error(`单文件安装程序编译失败：${detail}`);
  }

  const installer = await readFile(installerPath);
  const sha256 = createHash("sha256").update(installer).digest("hex");
  await writeFile(checksumPath, `${sha256}  ${path.basename(installerPath)}\n`, "utf8");
  return { path: installerPath, checksumPath, sha256, bytes: installer.length };
}

async function copyProductionDependencies(targetRoot) {
  const npmCliPath = process.env.npm_execpath
    || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const output = execFileSync(process.execPath, [
    npmCliPath,
    "ls",
    "--omit=dev",
    "--all",
    "--parseable",
    "--silent",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const nodeModulesRoot = path.join(root, "node_modules");
  const candidates = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${nodeModulesRoot}${path.sep}`))
    .sort((left, right) => left.length - right.length);
  const packageRoots = candidates.filter(
    (candidate, index) => !candidates.slice(0, index).some((parent) => candidate.startsWith(`${parent}${path.sep}`)),
  );
  for (const source of packageRoots) {
    const relative = path.relative(nodeModulesRoot, source);
    await cp(source, path.join(targetRoot, "node_modules", relative), { recursive: true });
  }
}

async function assertDirectory(target, message) {
  try {
    if ((await stat(target)).isDirectory()) return;
  } catch {
    // Fall through to the actionable error below.
  }
  throw new Error(message);
}

async function listFiles(directory) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output.sort();
}

function withUtf8Bom(content) {
  return Buffer.from(`\uFEFF${content}`, "utf8");
}

function withUtf16LeBom(content) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]);
}

function buildLauncher() {
  return `import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./server/src/app.js";
import { isWorkbenchApiHealthPayload } from "./launcher-health.mjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.dirname(runtimeRoot);
const appRoot = path.join(runtimeRoot, "app");
const dataDir = path.resolve(process.env.MOWEN_DATA_DIR || path.join(installRoot, "data"));
const host = "127.0.0.1";
const staticPort = Number(process.env.WORKBENCH_PORT || 4173);
const apiPort = Number(process.env.WORKBENCH_API_PORT || 8787);
const appUrl = \`http://\${host}:\${staticPort}/index.html\`;
const apiUrl = \`http://\${host}:\${apiPort}/api\`;
const pidFile = path.join(dataDir, "workbench.pid");
const logFile = path.join(dataDir, "launcher.log");
const servers = [];

await mkdir(dataDir, { recursive: true });
await log(\`启动工作台：\${appUrl}\`);

try {
  const apiReady = await isApiHealthy(\`\${apiUrl}/health\`);
  if (!apiReady) {
    const apiServer = createApp({ env: {
      NODE_ENV: "development",
      HOST: host,
      PORT: String(apiPort),
      DATA_DIR: dataDir,
      STORE_DRIVER: "json",
      CORS_ORIGIN: \`http://\${host}:\${staticPort}\`,
      APP_URL: appUrl,
      AI_PROXY_MODE: "mock",
      EMAIL_MODE: "log",
    } });
    await listen(apiServer, apiPort, "本地 API");
    servers.push(apiServer);
  } else {
    await log(\`复用已有本地 API：\${apiUrl}\`);
  }

  const staticReady = await isPageHealthy(appUrl, "摹文拟笔工作台");
  if (!staticReady) {
    const staticServer = createServer(serveStaticFile);
    await listen(staticServer, staticPort, "工作台页面");
    servers.push(staticServer);
  }

  if (servers.length === 0) {
    openBrowser(appUrl);
    process.exit(0);
  }

  await writeFile(pidFile, String(process.pid), "utf8");
  if (process.env.WORKBENCH_NO_OPEN !== "1") openBrowser(appUrl);
} catch (error) {
  await log(\`启动失败：\${error?.stack || error}\`);
  await showStartupError();
  process.exit(1);
}

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  await log(\`收到 \${signal}，停止工作台\`);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", async (error) => {
  await log(\`未捕获错误：\${error?.stack || error}\`);
  process.exit(1);
});
process.on("unhandledRejection", async (error) => {
  await log(\`未处理异步错误：\${error?.stack || error}\`);
  process.exit(1);
});

async function serveStaticFile(request, response) {
  try {
    const url = new URL(request.url || "/", \`http://\${request.headers.host || host}\`);
    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = path.resolve(appRoot, \`.\${requested}\`);
    if (target !== appRoot && !target.startsWith(\`\${appRoot}\${path.sep}\`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const info = await stat(target);
    const file = info.isDirectory() ? path.join(target, "index.html") : target;
    response.writeHead(200, {
      "Content-Type": mimeType(file),
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function mimeType(file) {
  const extension = path.extname(file).toLowerCase();
  return new Map([
    [".css", "text/css;charset=utf-8"],
    [".html", "text/html;charset=utf-8"],
    [".js", "text/javascript;charset=utf-8"],
    [".json", "application/json;charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
    [".ico", "image/x-icon"],
  ]).get(extension) || "application/octet-stream";
}

async function listen(server, port, label) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await log(\`\${label}已启动：\${host}:\${port}\`);
}

async function isApiHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const data = await response.json();
    return isWorkbenchApiHealthPayload(data);
  } catch {
    return false;
  }
}

async function isPageHealthy(url, marker) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.text()).includes(marker);
  } catch {
    return false;
  }
}

async function showStartupError() {
  if (process.platform !== "win32") return;
  try {
    const scriptPath = path.join(dataDir, "startup-error.vbs");
    const content = 'MsgBox "工作台启动失败，请查看日志：" & vbCrLf & "'
      + escapeVbsText(logFile)
      + '", 16, "摹文拟笔工作台"\\r\\n';
    const encoded = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]);
    await writeFile(scriptPath, encoded);
    const child = spawn("wscript.exe", [scriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // The launcher log remains available even if the error dialog cannot open.
  }
}

function escapeVbsText(value) {
  return String(value || "").replace(/"/g, '""');
}

function openBrowser(url) {
  if (process.platform !== "win32") return;
  const child = spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function log(message) {
  const line = \`[\${new Date().toISOString()}] \${message}\\n\`;
  await appendFile(logFile, line, "utf8").catch(() => {});
}
`;
}

function buildVbsLauncher() {
  return `Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
command = Chr(34) & root & "\\node.exe" & Chr(34) & " " & Chr(34) & root & "\\launcher.mjs" & Chr(34)
shell.Run command, 0, False
`;
}

function buildStopScript() {
  return `@echo off
chcp 65001 >nul
set "PID_FILE=%~dp0..\\data\\workbench.pid"
if not exist "%PID_FILE%" (
  echo 工作台当前没有运行，或 PID 文件不存在。
  pause
  exit /b 0
)
set /p WORKBENCH_PID=<"%PID_FILE%"
taskkill /PID %WORKBENCH_PID% /T /F >nul 2>&1
if errorlevel 1 (
  echo 未找到运行中的工作台进程。
) else (
  echo 工作台已停止。
)
del /q "%PID_FILE%" >nul 2>&1
pause
`;
}

function buildInstallerCmd() {
  return `@echo off
setlocal
chcp 65001 >nul
title 摹文拟笔工作台安装程序
set "LOG_FILE=%~dp0install.log"
if not exist "%~dp0install.ps1" goto :missing_files
if not exist "%~dp0payload\node.exe" goto :missing_files

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" >"%LOG_FILE%" 2>&1
set "INSTALL_EXIT=%ERRORLEVEL%"
type "%LOG_FILE%"
echo.
if "%INSTALL_EXIT%"=="0" (
  echo 安装完成。以后可从桌面或开始菜单启动工作台。
) else (
  echo 安装未完成，详细信息已写入：%LOG_FILE%
)
echo.
pause
exit /b %INSTALL_EXIT%

:missing_files
echo 安装包不完整，请不要直接在 ZIP 压缩包内运行。
echo 请完整解压全部文件后重试，或直接使用单文件 Setup.exe。
>"%LOG_FILE%" echo 安装包不完整：缺少 install.ps1 或 payload\node.exe。
echo 日志：%LOG_FILE%
pause
exit /b 1
`;
}

function buildInstallerPowerShell() {
  return `$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $packageRoot "payload"
$installRoot = if ([string]::IsNullOrWhiteSpace($env:MOWEN_INSTALL_ROOT)) {
  Join-Path $env:LOCALAPPDATA "MowenNibiWorkbench"
} else {
  [IO.Path]::GetFullPath($env:MOWEN_INSTALL_ROOT)
}
$runtimeTarget = Join-Path $installRoot "runtime"
$dataTarget = Join-Path $installRoot "data"
$pidFile = Join-Path $dataTarget "workbench.pid"

if (-not (Test-Path -LiteralPath $payload)) {
  throw "安装包不完整：缺少 payload 目录。请先完整解压 ZIP。"
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
New-Item -ItemType Directory -Path $dataTarget -Force | Out-Null
if (Test-Path -LiteralPath $pidFile) {
  $pidValue = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($pidValue -match '^\\d+$') {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $runtimeTarget) {
  $resolvedRoot = [IO.Path]::GetFullPath($installRoot)
  $resolvedRuntime = [IO.Path]::GetFullPath($runtimeTarget)
  if (-not $resolvedRuntime.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw "拒绝清理意外的安装路径：$resolvedRuntime"
  }
  Remove-Item -LiteralPath $runtimeTarget -Recurse -Force
}
Copy-Item -LiteralPath $payload -Destination $runtimeTarget -Recurse -Force
Copy-Item -LiteralPath (Join-Path $packageRoot "uninstall.ps1") -Destination (Join-Path $installRoot "uninstall.ps1") -Force
Copy-Item -LiteralPath (Join-Path $packageRoot "卸载摹文拟笔工作台.cmd") -Destination (Join-Path $installRoot "卸载摹文拟笔工作台.cmd") -Force

$shell = New-Object -ComObject WScript.Shell
$desktop = if ([string]::IsNullOrWhiteSpace($env:MOWEN_DESKTOP_DIR)) {
  [Environment]::GetFolderPath("Desktop")
} else {
  [IO.Path]::GetFullPath($env:MOWEN_DESKTOP_DIR)
}
$startMenu = if ([string]::IsNullOrWhiteSpace($env:MOWEN_START_MENU_DIR)) {
  Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\摹文拟笔工作台"
} else {
  [IO.Path]::GetFullPath($env:MOWEN_START_MENU_DIR)
}
New-Item -ItemType Directory -Path $desktop -Force | Out-Null
New-Item -ItemType Directory -Path $startMenu -Force | Out-Null

function New-WorkbenchShortcut([string]$path) {
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = (Join-Path $env:WINDIR "System32\\wscript.exe")
  $shortcut.Arguments = '"' + (Join-Path $runtimeTarget "启动工作台.vbs") + '"'
  $shortcut.WorkingDirectory = $runtimeTarget
  $shortcut.IconLocation = (Join-Path $runtimeTarget "node.exe") + ",0"
  $shortcut.Description = "启动摹文拟笔工作台"
  $shortcut.Save()
}

New-WorkbenchShortcut (Join-Path $desktop "摹文拟笔工作台.lnk")
New-WorkbenchShortcut (Join-Path $startMenu "摹文拟笔工作台.lnk")

$uninstallShortcut = $shell.CreateShortcut((Join-Path $startMenu "卸载摹文拟笔工作台.lnk"))
$uninstallShortcut.TargetPath = (Join-Path $installRoot "卸载摹文拟笔工作台.cmd")
$uninstallShortcut.WorkingDirectory = $installRoot
$uninstallShortcut.Description = "卸载摹文拟笔工作台（保留用户数据）"
$uninstallShortcut.Save()

Write-Host "摹文拟笔工作台已安装到：$installRoot" -ForegroundColor Green
Write-Host "用户数据保存在：$dataTarget" -ForegroundColor Cyan
if ($env:MOWEN_SKIP_LAUNCH -ne "1") {
  Start-Process -FilePath (Join-Path $env:WINDIR "System32\\wscript.exe") -ArgumentList ('"' + (Join-Path $runtimeTarget "启动工作台.vbs") + '"')
}
`;
}

function buildUninstallerCmd() {
  return `@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
pause
`;
}

function buildUninstallerPowerShell() {
  return `$ErrorActionPreference = "Stop"
$installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeTarget = Join-Path $installRoot "runtime"
$dataTarget = Join-Path $installRoot "data"
$pidFile = Join-Path $dataTarget "workbench.pid"

if (Test-Path -LiteralPath $pidFile) {
  $pidValue = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($pidValue -match '^\\d+$') {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$desktop = if ([string]::IsNullOrWhiteSpace($env:MOWEN_DESKTOP_DIR)) {
  [Environment]::GetFolderPath("Desktop")
} else {
  [IO.Path]::GetFullPath($env:MOWEN_DESKTOP_DIR)
}
$startMenu = if ([string]::IsNullOrWhiteSpace($env:MOWEN_START_MENU_DIR)) {
  Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\摹文拟笔工作台"
} else {
  [IO.Path]::GetFullPath($env:MOWEN_START_MENU_DIR)
}
$desktopShortcut = Join-Path $desktop "摹文拟笔工作台.lnk"
Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $startMenu -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $runtimeTarget) {
  $resolvedRoot = [IO.Path]::GetFullPath($installRoot)
  $resolvedRuntime = [IO.Path]::GetFullPath($runtimeTarget)
  if (-not $resolvedRuntime.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw "拒绝清理意外的安装路径：$resolvedRuntime"
  }
  Remove-Item -LiteralPath $runtimeTarget -Recurse -Force
}

Write-Host "摹文拟笔工作台运行文件已卸载。" -ForegroundColor Green
Write-Host "用户数据仍保留在：$dataTarget" -ForegroundColor Cyan
Write-Host "确认不再需要后，可手动删除该 data 目录。"
`;
}

function buildInstallReadme() {
  return `摹文拟笔工作台 Windows 安装包
================================

安装：
1. 推荐直接双击同版本的“Setup.exe”，无需手动解压。
2. 使用 ZIP 时，必须先完整解压全部文件，再双击“安装摹文拟笔工作台.cmd”。
3. 不要在 ZIP 压缩包预览窗口内直接运行 CMD。
4. 安装完成后会自动打开浏览器，并创建桌面与开始菜单快捷方式。

默认安装位置：
%LOCALAPPDATA%\\MowenNibiWorkbench

数据位置：
%LOCALAPPDATA%\\MowenNibiWorkbench\\data

说明：
- 安装包已内置 Node.js，不需要另外安装开发环境。
- 内置公文写作组件采用非商业许可证。详情见安装目录 runtime\\app\\THIRD_PARTY_NOTICES.md 及其中引用的许可证。
- 工作台默认使用 http://127.0.0.1:4173。
- 本地 API 默认使用 http://127.0.0.1:8787/api。
- 文档正文与执笔人主要保存在浏览器 IndexedDB；云端灰度数据保存在上述 data 目录。
- 更新安装时会替换 runtime 目录，但不会删除 data 目录。
- 卸载默认保留用户数据，避免误删文档和账号信息。
- 安装失败时可查看安装目录中的 installer.log；ZIP 安装器还会在解压目录生成 install.log。
- 本安装包未做商业代码签名，Windows 可能显示安全提醒；请确认安装包来源和 SHA-256 校验值。
`;
}
