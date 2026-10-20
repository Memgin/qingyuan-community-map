#!/usr/bin/env pwsh
# 清远社区共享地图 · 鸿蒙客户端 —— 命令行构建脚本
#
# 用法：  pwsh -File build.ps1
# 产物：  entry/build/default/outputs/default/entry-default-unsigned.hap
# 日志：  verification/build.log
$ErrorActionPreference = 'Stop'
$taskDevEcoRoot = 'D:\Program Files\Huawei\DevEco Studio'
$env:DEVECO_SDK_HOME = Join-Path $taskDevEcoRoot 'sdk'
$env:NODE_HOME = Join-Path $taskDevEcoRoot 'tools\node'
$env:JAVA_HOME = Join-Path $taskDevEcoRoot 'jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:NODE_HOME;$taskDevEcoRoot\tools\ohpm\bin;$env:Path"
$taskLogFolder = Join-Path $PSScriptRoot 'verification'
New-Item -ItemType Directory -Path $taskLogFolder -Force | Out-Null
Push-Location -LiteralPath $PSScriptRoot
try {
  & "$env:NODE_HOME\node.exe" "$taskDevEcoRoot\tools\ohpm\bin\pm-cli.js" install
  if ($LASTEXITCODE -ne 0) { throw 'ohpm install 失败' }
  & "$env:NODE_HOME\node.exe" "$taskDevEcoRoot\tools\hvigor\bin\hvigorw.js" --mode module -p module=entry@default -p product=default assembleHap --no-daemon 2>&1 |
    Tee-Object -FilePath (Join-Path $taskLogFolder 'build.log')
  if ($LASTEXITCODE -ne 0) { throw 'Hvigor 构建失败，请查看 verification\build.log' }
  Write-Host '构建成功。' -ForegroundColor Green
} finally {
  Pop-Location
}
