# Runs browser/HTTP suites one by one against the isolated local MariaDB 10.11 (zenzales_test, port 33307, same engine
# as the hosting; settings in .tools/test-env.json, the old PostgreSQL ones in .tools/test-env.pg.json), each with fresh fixtures
# and the general HTTP suite (npm test) first. Every external service points to a local simulator: Dropi 8443-8445,
# Meta Graph 8446, OpenAI 8447. -Ai also starts the AI test router on 8083 (ai-http, ai-ui). Never use production data.
# Usage: powershell -File tests/run-suites.ps1 -Only whatsapp-templates,orders [-Ai]
param([string]$Label='run',[string[]]$Only=@(),[switch]$Ai)
Set-Location (Split-Path $PSScriptRoot -Parent)
$config = Get-Content -LiteralPath ".tools/test-env.json" -Raw | ConvertFrom-Json
foreach ($entry in $config.PSObject.Properties) { [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, 'Process') }
$env:DROPI_TRACKING_URL='https://127.0.0.1:8445/integrations/orders/myorders/'; $env:DROPI_QUOTE_URL='https://127.0.0.1:8444/integrations/orders/cotizaEnvioTransportadoraV2'; $env:DROPI_ORDERS_URL='https://127.0.0.1:8443/integrations/orders/myorders'; $env:DROPI_CATALOG_URL='https://127.0.0.1:8448/integrations/products/index'; $env:HTTP_CA_BUNDLE=(Resolve-Path .tools/test-cert.pem).Path
# WhatsApp: simulated Graph API and test-only platform values.
$env:WHATSAPP_GRAPH_URL='https://127.0.0.1:8446/'; $env:AI_OPENAI_URL='https://127.0.0.1:8447'; $env:WHATSAPP_APP_SECRET='test-app-secret-not-real'; $env:WHATSAPP_VERIFY_TOKEN='test-verify-token'
$env:TEST_BASE_URL='http://127.0.0.1:8081'
$old = Get-Process -Id (Get-Content .tools/php-server.pid -ErrorAction SilentlyContinue) -ErrorAction SilentlyContinue; if ($old -and $old.Path -like '*\.tools\php\php.exe') { Stop-Process -Id $old.Id -Confirm:$false }
$server = Start-Process -FilePath .tools/php/php.exe -ArgumentList @('-S','127.0.0.1:8081','-t','backend/public','backend/router.php') -WindowStyle Hidden -RedirectStandardOutput .tools/php-server.out.log -RedirectStandardError .tools/php-server.err.log -PassThru
Set-Content -LiteralPath .tools/php-server.pid -Value $server.Id; Start-Sleep -Seconds 1
# The AI router intercepts the providers itself, so it must not inherit the WhatsApp AI simulator URL.
$aiServer = if ($Ai) { $keep=$env:AI_OPENAI_URL; Remove-Item Env:AI_OPENAI_URL -ErrorAction SilentlyContinue; $p=Start-Process -FilePath .tools/php/php.exe -ArgumentList @('-S','127.0.0.1:8083','-t','backend/public','backend/tests/ai-router.php') -WindowStyle Hidden -PassThru; $env:AI_OPENAI_URL=$keep; $p } else { $null }
"== $Label"
function Summary([string]$o){
 $lines = $o -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch 'NativeCommandError|CategoryInfo|FullyQualifiedErrorId|En l.nea|^\+|triggerUncaughtException|run_main|^\^' }
 $m = $lines | Where-Object { $_ -match '^(OK )?\d+ .*(passed|checks)' } | Select-Object -Last 1
 if (-not $m) { $m = $lines | Where-Object { $_ -match 'AssertionError|Error|Timeout|SKIP|FAIL' } | Select-Object -First 1 }
 if (-not $m) { $m = $lines | Select-Object -Last 1 }
 if ($m.Length -gt 200) { $m = $m.Substring(0,200) }
 return $m
}
function Fresh(){ .tools/run-test-command.ps1 backend/tests/fixtures.php cleanup | Out-Null; .tools/run-test-command.ps1 backend/tests/fixtures.php create | Out-Null; return (Summary ((npm test 2>&1) | Out-String)) }
if (-not $Only.Count) {
 "{0,-20} {1}" -f 'npm test', (Fresh)
 foreach ($p in 'run','builder') { if (Test-Path "backend/tests/$p.php") { "{0,-20} {1}" -f "php $p", (Summary ((.tools/php/php.exe "backend/tests/$p.php" 2>&1) | Out-String)) } }
}
$suites = if ($Only.Count) { $Only } else { 'builder','builder-http','gallery','header','lead-success','lead-phone-country','dropi-block','product-list','visual','delivery-ui','geography','dropi-shipping','store-router','brand','orders' }
foreach ($t in $suites) {
 if (-not (Test-Path "tests/$t.mjs")) { continue }
 $null = Fresh
 .tools/php/php.exe backend/tests/orders-helper.php reset-limits | Out-Null
 "{0,-20} {1}" -f $t, (Summary ((node "tests/$t.mjs" 2>&1) | Out-String))
}
Stop-Process -Id $server.Id -Confirm:$false
if ($aiServer) { Stop-Process -Id $aiServer.Id -Confirm:$false -ErrorAction SilentlyContinue }
.tools/run-test-command.ps1 backend/tests/fixtures.php cleanup | Out-Null
