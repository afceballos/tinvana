# Genera output/deploy/tinvana-vendor.zip (dependencias PHP de producción) para subirlo una vez a ~/tinvana/vendor.
# Usa el PHP/Composer locales de .tools; no incluye .env ni storage.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$php = Join-Path $root '.tools\php\php.exe'
$stage = Join-Path $root 'output\deploy\stage'
$out = Join-Path $root 'output\deploy'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $root 'backend\composer.json'), (Join-Path $root 'backend\composer.lock') $stage
& $php (Join-Path $root '.tools\composer.phar') install --working-dir=$stage --no-dev --optimize-autoloader --no-interaction --ignore-platform-req=ext-pdo_pgsql
if ($LASTEXITCODE -ne 0) { throw 'composer install falló' }
$zip = Join-Path $out 'tinvana-vendor.zip'
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $stage 'vendor') -DestinationPath $zip
Remove-Item -Recurse -Force $stage
Write-Host "Listo: $zip"
