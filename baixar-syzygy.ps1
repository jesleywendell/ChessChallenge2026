# Baixa as tablebases Syzygy de 3 a 5 pecas (~1 GB, 290 arquivos) para C:\syzygy.
# Uso (no cmd):  powershell -ExecutionPolicy Bypass -File baixar-syzygy.ps1
# Pode rodar de novo: arquivos ja baixados sao pulados.
param([string]$Destino = "C:\syzygy")

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$espelhos = @(
  "https://tablebase.lichess.ovh/tables/standard/3-4-5/",
  "http://tablebase.sesse.net/syzygy/3-4-5/"
)

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

$base = $null
$arquivos = @()
foreach ($espelho in $espelhos) {
  try {
    Write-Host "Lendo lista de arquivos em $espelho ..."
    $html = (Invoke-WebRequest -UseBasicParsing -Uri $espelho).Content
    $arquivos = [regex]::Matches($html, 'href="([A-Za-z0-9]+\.rtb[wz])"') |
      ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    if ($arquivos.Count -gt 0) { $base = $espelho; break }
  } catch {
    Write-Host "  falhou: $($_.Exception.Message)"
  }
}
if (-not $base) { Write-Host "ERRO: nenhum espelho respondeu."; exit 1 }

Write-Host "$($arquivos.Count) arquivos (o esperado e 290)."
$i = 0
foreach ($nome in $arquivos) {
  $i++
  $alvo = Join-Path $Destino $nome
  if ((Test-Path $alvo) -and ((Get-Item $alvo).Length -gt 0)) { continue }
  Write-Host "[$i/$($arquivos.Count)] $nome"
  $tmp = "$alvo.part"
  for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri ($base + $nome) -OutFile $tmp
      Move-Item -Force $tmp $alvo
      break
    } catch {
      Write-Host "  tentativa $tentativa falhou: $($_.Exception.Message)"
      if ($tentativa -eq 3) { Write-Host "  desisti de $nome (rode o script de novo depois)" }
    }
  }
}

$total = (Get-ChildItem $Destino -Filter *.rtb? | Measure-Object -Property Length -Sum)
Write-Host ("Pronto: {0} arquivos, {1:N0} MB em {2}" -f $total.Count, ($total.Sum / 1MB), $Destino)
Write-Host "O iniciar.bat ja usa C:\syzygy automaticamente se a pasta existir."
