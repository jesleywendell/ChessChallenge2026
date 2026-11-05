@echo off
REM Supervisor do Chess Challenge: se o servidor cair, ele reinicia sozinho e a
REM partida volta do disco (data\current-game.json) com o relogio pausado.
REM Na interface, confira o relogio fisico e toque em Retomar.
cd /d "%~dp0"

REM ===== Ajuste antes da competicao (tire o REM da frente) =====
for %%f in ("C:\Users\Desktop\Downloads\stockfish-windows-x86-64-universal\stockfish\*.exe") do set "STOCKFISH_PATH=%%f"
if not defined STOCKFISH_PATH (echo ERRO: nenhum .exe do Stockfish na pasta configurada & pause & exit /b 1)
echo Stockfish: %STOCKFISH_PATH%
REM set "SYZYGY_PATH=C:\syzygy"
REM set "ENGINE_THREADS=8"
REM set "ENGINE_HASH_MB=2048"

if not exist "dist\web\index.html" call npm run build

:loop
echo [%date% %time%] Iniciando servidor em http://127.0.0.1:8787 ...
call npm start
echo [%date% %time%] Servidor encerrou (codigo %errorlevel%). Reiniciando em 2 s...
echo Para sair de vez: feche esta janela.
timeout /t 2 /nobreak >nul
goto loop
