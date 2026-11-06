@echo off
REM Supervisor do Chess Challenge: se o servidor cair, ele reinicia sozinho e a
REM partida volta do disco (data\current-game.json) com o relogio pausado.
REM Na interface, confira o relogio fisico e toque em Retomar.
cd /d "%~dp0"

REM ===== Stockfish =====
for %%f in ("C:\Users\Desktop\Downloads\stockfish-windows-x86-64-universal\stockfish\*.exe") do set "STOCKFISH_PATH=%%f"
if not defined STOCKFISH_PATH (echo ERRO: nenhum .exe do Stockfish na pasta configurada & pause & exit /b 1)
echo Stockfish: %STOCKFISH_PATH%

REM ===== Tablebases Syzygy (baixe com baixar-syzygy.ps1) =====
if exist "C:\syzygy\KQvK.rtbw" (
  set "SYZYGY_PATH=C:\syzygy"
  echo Syzygy: C:\syzygy
) else (
  echo AVISO: tablebases Syzygy nao encontradas em C:\syzygy. Rode baixar-syzygy.ps1.
)

REM ===== Opcoes (tire o REM da frente para usar) =====
REM set "ENGINE_THREADS=12"
REM set "ENGINE_HASH_MB=2048"
REM Desliga o anti-empate (volta a jogar sempre o lance do Stockfish):
REM set "ANTI_DRAW=0"
REM MultiPV usado pelo anti-empate (1 desliga as alternativas):
REM set "ENGINE_MULTIPV=3"

REM ===== Nao abrir dois servidores ao mesmo tempo =====
netstat -ano | findstr /r /c:":8787 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo ERRO: a porta 8787 ja esta em uso. Ja existe um servidor aberto
  echo ^(outra janela do iniciar.bat ou um npm start^). Feche-o e rode de novo.
  pause
  exit /b 1
)

if not exist "dist\web\index.html" call npm run build

:loop
echo [%date% %time%] Iniciando servidor em http://127.0.0.1:8787 ...
call npm start
echo [%date% %time%] Servidor encerrou (codigo %errorlevel%). Reiniciando em 2 s...
echo Para sair de vez: feche esta janela.
timeout /t 2 /nobreak >nul
goto loop
