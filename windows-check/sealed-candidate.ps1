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
    $known = @('source tree', 'snapshot verification', 'Converter offline checks', 'source version and pin', 'web page assembly', 'WebView2 SDK setup', 'MSVC compile', 'native self-test', 'unsigned MSIX', 'unpackaged WebView2', 'Watercolor in-app paint and JXL', 'complete')
    $stage = if ($known -contains $receipt.stage) { $receipt.stage } else { 'child receipt unavailable' }
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
    $native = if ($receipt.nativeSelfTest -eq 'PASS') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $pack = if ($receipt.package -eq 'PASS unsigned test MSIX') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $probe = if ($receipt.webviewStartup -eq 'PASS unpackaged WebView2') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    if ($native -ne 'PASS' -or $pack -ne 'PASS' -or $probe -ne 'PASS') { $result = $false }
    if ($App -eq 'watercolor') {
      $stroke = if ($receipt.paintStroke -ceq 'PASS' -and $probe -eq 'PASS') { 'PASS' } elseif ($receipt.paintStroke -ceq 'FAIL') { 'FAIL' } else { 'UNRUN' }
      $jxl = if ($receipt.paintedLayerJxl -ceq 'PASS' -and $stroke -eq 'PASS') { 'PASS' } elseif ($receipt.paintedLayerJxl -ceq 'FAIL') { 'FAIL' } else { 'UNRUN' }
      if ($stroke -ne 'PASS' -or $jxl -ne 'PASS') { $result = $false }
      if ($receipt.paintStage -cin @('admission','tool-menu','paint-select','brush-select','stroke-input','stroke-settle','observe','encode','decode','complete')) {
        Write-Host ("Candidate paint substage: {0}" -f $receipt.paintStage)
      }
      if ($receipt.paintCode -cin @('TRANSPORT_TIMEOUT','STAGE_FAILED')) {
        Write-Host ("Candidate paint diagnostic: {0}" -f $receipt.paintCode)
      }
      $paintAdmission = @('READY','MARKER_MISMATCH','BOOT_FAILED','BOOT_PENDING','PART_PENDING','PART_FAILED','CLIENT_PENDING','DOOR_YIELDED','SURFACE_PENDING','STATE_INCOMPLETE','DIRTY_SHAPES','DIRTY_HISTORY','SURFACE_BUSY','ALREADY_ATTEMPTED','MENU_MISSING','MENU_DISABLED','MENU_NOT_VISIBLE','MENU_OCCLUDED','EVAL_EXCEPTION','TRANSPORT_TIMEOUT','ADMISSION_TIMEOUT','SESSION_CHANGED')
      if ($receipt.paintAdmission -cin $paintAdmission) {
        Write-Host ("Candidate paint admission: {0}" -f $receipt.paintAdmission)
      }
      if ($receipt.paintAdmission -ceq 'ADMISSION_TIMEOUT' -and $receipt.paintAdmissionLast -cin $paintAdmission) {
        Write-Host ("Candidate paint last readiness: {0}" -f $receipt.paintAdmissionLast)
      }
      $strokeCodes = @('READY','SESSION_CHANGED','TOOL_CHANGED','POINTER_CANCELLED','UNTRUSTED_INPUT','DELIVERY_INCOMPLETE','DELIVERY_MISMATCH','SURFACE_FAILED','COMMIT_FAILED','HELD_PRESS','TOOL_TRANSITION','GESTURE_ACTIVE','FINISHING','LAYER_ABSENT','SURFACE_ABSENT','SURFACE_GONE','LIFT_PENDING','COMMIT_PENDING','SURFACE_PENDING','MENU_OPEN','TARGET_OBSCURED','TARGET_UNAVAILABLE','STROKE_TIMEOUT','EVAL_EXCEPTION','TRANSPORT_TIMEOUT')
      if ($receipt.strokeCode -cin $strokeCodes) { Write-Host ("Candidate paint stroke diagnostic: {0}" -f $receipt.strokeCode) }
      if ($receipt.strokeCode -ceq 'STROKE_TIMEOUT' -and $receipt.lastStrokeCode -cin $strokeCodes) { Write-Host ("Candidate paint last stroke reason: {0}" -f $receipt.lastStrokeCode) }
      if ($receipt.paintPointerDelivery -cin @('cancelled','trusted-paint-observed','trusted-receipt','mismatch','incomplete')) { Write-Host ("Candidate paint pointer delivery: {0}" -f $receipt.paintPointerDelivery) }
      if ($receipt.paintObserverCleanup -ceq 'UNCONFIRMED') { Write-Host 'Candidate paint observer cleanup: UNCONFIRMED' }
      if ($receipt.paintTiming -cin @('blit','seat','brush','layer','pre-layer','not-started')) { Write-Host ("Candidate paint timing milestone: {0}" -f $receipt.paintTiming) }
      if ($receipt.paintRetention -cin @('raster-history','raster-only','history-only','none')) { Write-Host ("Candidate paint retained evidence: {0}" -f $receipt.paintRetention) }
      Write-Host ("Candidate Watercolor Paint-tool stroke: {0}" -f $stroke)
      Write-Host ("Candidate Painted-layer in-app JPEG XL round-trip: {0}" -f $jxl)
      @("- Paint-tool stroke: $stroke", "- Painted-layer in-app JPEG XL round-trip: $jxl", '- Native Save/picker and full-canvas export: UNRUN') | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
    $outcome = if ($result) { 'PASS' } else { 'FAIL' }
    Write-Host ("Candidate phase: {0}; {1}" -f $stage, $outcome)
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
