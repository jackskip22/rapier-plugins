param([Parameter(Mandatory)][ValidateSet('watercolor','converter')][string]$App)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path '.').Path
$runnerDir = Join-Path $env:RUNNER_TEMP ('sealed-' + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $runnerDir 'candidate.zip'
$result = $false
$started = $false
$outerStage = 'authenticate snapshot'
try {
  New-Item -ItemType Directory -Path $runnerDir | Out-Null
  node (Join-Path $workspace 'windows-check/unseal.mjs') $App (Join-Path $workspace 'sealed') $archive
  if ($LASTEXITCODE -ne 0) { throw 'No authenticated archive.' }
  $guide = Join-Path $runnerDir 'guides.tar.gz'
  node (Join-Path $workspace 'windows-check/unseal.mjs') guides (Join-Path $workspace 'sealed') $guide
  if ($LASTEXITCODE -ne 0) { throw 'No authenticated build input.' }
  Remove-Item Env:WINDOWS_CANDIDATE_KEY -ErrorAction SilentlyContinue
  $outerStage = 'extract snapshot'
  # A zip with UTF-8 names: Windows' tar misreads the fixtures' non-ASCII names; Expand-Archive keeps them.
  try { Expand-Archive -LiteralPath $archive -DestinationPath $runnerDir -Force -ErrorAction Stop } catch { throw 'Snapshot extraction failed.' }
  & tar.exe -xzf $guide -C $runnerDir *> (Join-Path $runnerDir 'guide.log')
  if ($LASTEXITCODE -ne 0) { throw 'Build input extraction failed.' }
  if (!(Test-Path -LiteralPath (Join-Path $runnerDir 'source/docs/agents.md') -PathType Leaf)) { throw 'Build input missing.' }
  Remove-Item -LiteralPath $archive,$guide -Force
  $source = Join-Path $runnerDir 'source'
  $candidate = Join-Path $source 'handover/tools/checks/barry-windows-ci/candidate.ps1'
  if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Test script not found.' }
  $outerStage = 'start test child'
  Push-Location $source
  try {
    $parameters = @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', ('"' + $candidate + '"'), '-App', $App)
    $proc = Start-Process pwsh -WorkingDirectory $source -ArgumentList $parameters -PassThru -Wait -RedirectStandardOutput (Join-Path $runnerDir 'stdout.log') -RedirectStandardError (Join-Path $runnerDir 'stderr.log')
    $started = $true
    $result = $proc.ExitCode -eq 0
    $receiptFile = Join-Path $source '.windows-candidate/receipt.json'
    $receipt = if (Test-Path -LiteralPath $receiptFile) { Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json } else { $null }
    $known = @('source tree', 'snapshot verification', 'Converter offline checks', 'source version and pin', 'web page assembly', 'WebView2 SDK setup', 'MSVC compile', 'native self-test', 'unsigned MSIX', 'unpackaged WebView2', 'native Converter save', 'complete')
    $stage = if ($known -contains $receipt.stage) { $receipt.stage } else { 'child receipt unavailable' }
    $outcome = if ($result) { 'PASS' } else { 'FAIL' }
    Write-Host ("Candidate phase: {0}; {1}" -f $stage, $outcome)
    $code = $receipt.buildCode
    if ($code -is [string] -and $code -cmatch '^(separator|file-url|case-collision|line-ending|module-url|module-not-found|memory|resource-pin|resource-network|toolchain|source-gate|page-budget|guide-not-found|file-not-found|file-access|file-system|syntax|unclassified|node-no-code|html-hash-failed|pass|not-run)$') {
      Write-Host ("Candidate build code: {0}" -f $code)
    }
    $constructor = $receipt.buildConstructor
    if ($constructor -is [string] -and $constructor -cmatch '^(Error|TypeError|RangeError|SyntaxError|ReferenceError|URIError|EvalError|AggregateError|unknown)$') {
      Write-Host ("Candidate build constructor: {0}" -f $constructor)
    }
    $site = $receipt.buildSite
    if ($site -is [string] -and $site -cmatch '^(build|reuse|builtin|packed):[1-9][0-9]{0,5}:[1-9][0-9]{0,5}$') {
      Write-Host ("Candidate build site: {0}" -f $site)
    }
    $buildPhase = $receipt.buildPhase
    if ($buildPhase -is [string] -and $buildPhase -cmatch '^(imports|prepare|gates|assembly|outputs|receipt)$') {
      Write-Host ("Candidate build substage: {0}" -f $buildPhase)
    }
    $compileCode = $receipt.compileCode
    if ($compileCode -is [string] -and $compileCode -cmatch '^(vswhere-unavailable|vswhere-return|msbuild-unavailable|invalid-sdk|invalid-toolset|start-failed|build-return|linked-output-missing|pass)$') {
      Write-Host ("Candidate compile code: {0}" -f $compileCode)
    }
    if ($receipt.compileContext -ceq 'resource-stage-command') { Write-Host 'Candidate compile context: resource-stage-command' }
    foreach ($compilerError in @($receipt.compilerErrors | Select-Object -First 16)) {
      if ($compilerError -is [string] -and $compilerError -cmatch '^(C|LNK|MSB|RC)[0-9]{4}$') {
        Write-Host ("Candidate compiler error: {0}" -f $compilerError)
      }
    }
    $webviewCode = $receipt.webviewCode
    if ($webviewCode -is [string] -and $webviewCode -cmatch '^(endpoint|target|socket-policy|socket-connect|page-evaluate|app-identity|platform|document-ready|converter-tabs|viewer-ready|viewer-init-failed|archive-ready|archive-init-failed|proof-write|screenshot|screenshot-write|pass|process-exited|launch-failed|probe-unreported)$') {
      Write-Host ("Candidate WebView2 code: {0}" -f $webviewCode)
    }
    $native = if ($receipt.nativeSelfTest -eq 'PASS') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $pack = if ($receipt.package -eq 'PASS unsigned test MSIX') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $probe = if ($receipt.webviewStartup -eq 'PASS unpackaged WebView2') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $save = if ($App -ne 'converter') { 'n/a' } elseif ($receipt.nativeConvertSave -eq 'PASS') { 'PASS' } elseif ($receipt.nativeConvertSave -eq 'FAIL') { 'FAIL' } else { 'UNRUN' }
    if ($App -eq 'converter') { Write-Host ("Candidate native Converter save: {0}" -f $save) }
    if ($App -eq 'converter' -and $save -ne 'PASS') { $result = $false }
    if ($native -ne 'PASS' -or $pack -ne 'PASS' -or $probe -ne 'PASS') { $result = $false }
    @(
      "### $App"
      "- Native executable self-test: $native"
      "- Unsigned test MSIX package: $pack"
      "- Unpackaged WebView2 startup: $probe"
      '- Signed install, native picker/Explorer round trip, HDR and physical GPU: UNRUN'
    ) | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
  } finally { Pop-Location }
} catch {
  Write-Host ('Candidate phase: {0}; FAIL' -f $outerStage)
} finally {
  Remove-Item Env:WINDOWS_CANDIDATE_KEY -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $runnerDir) { Remove-Item -LiteralPath $runnerDir -Recurse -Force -ErrorAction SilentlyContinue }
}
if (!$started -or !$result) { exit 1 }
