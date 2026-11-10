@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not exist "client\dist\index.html" (
  echo Gerando o build do cliente...
  call npm run build
  if errorlevel 1 goto :error
)

echo.
echo  WhiteBoard - como iniciar?
echo.
echo   [1] Somente local (http://localhost:3001)
echo   [2] Mesma rede (LAN)
echo   [3] NGROK
echo   [4] CLOUDFLARED
echo   [5] BORE
echo   [6] TAILSCALE publico (funnel)
echo   [7] TAILSCALE privado (serve)
echo   [8] PINGGY
echo   [9] ZROK
echo.
set /p "opcao=Escolha uma opcao [1-9]: "
if "%opcao%"=="" set "opcao=1"

if "%opcao%"=="1" goto :local
if "%opcao%"=="2" goto :lan
if "%opcao%"=="3" goto :ngrok
if "%opcao%"=="4" goto :cloudflared
if "%opcao%"=="5" goto :bore
if "%opcao%"=="6" goto :tailscale_funnel
if "%opcao%"=="7" goto :tailscale_serve
if "%opcao%"=="8" goto :pinggy
if "%opcao%"=="9" goto :zrok

echo Opcao invalida.
pause
exit /b 1

:local
echo.
echo Servidor em http://localhost:3001 - Ctrl+C encerra.
npm start
goto :eof

:lan
echo.
set "IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway} | Select-Object -First 1 -ExpandProperty IPv4Address | Select-Object -ExpandProperty IPAddress"`) do set "IP=%%i"
if not defined IP for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'} | Select-Object -First 1 -ExpandProperty IPAddress"`) do set "IP=%%i"
set "ROOM=quadro-%RANDOM%"
echo Servidor local: http://localhost:3001/?room=%ROOM%
if defined IP (
  echo Na mesma rede: http://%IP%:3001/?room=%ROOM%
) else (
  echo Nao consegui descobrir o IP. Rode ipconfig e use o IPv4 da sua rede.
)
echo Se o outro PC nao abrir, libere a porta 3001 no firewall do Windows.
echo Ctrl+C encerra.
npm start
goto :eof

:ngrok
set "NGROK=ngrok"
if exist "ngrok.exe" set "NGROK=.\ngrok"

if not exist "tokens Ngrok.txt" goto :ngrok_plain

set /a NG_N=0
for /f "usebackq tokens=1* delims=:" %%a in ("tokens Ngrok.txt") do (
  if not "%%~b"=="" (
    set /a NG_N+=1
    for /f "tokens=* delims= " %%x in ("%%a") do set "NG_NAME[!NG_N!]=%%x"
    for /f "tokens=* delims= " %%y in ("%%b") do set "NG_TOKEN[!NG_N!]=%%y"
  )
)

if !NG_N! EQU 0 goto :ngrok_plain

echo.
echo Contas ngrok:
for /l %%i in (1,1,!NG_N!) do echo   [%%i] !NG_NAME[%%i]!
echo.
set /p "conta=Escolha a conta [1-!NG_N!]: "
if "!conta!"=="" set "conta=1"
set "TOKEN=!NG_TOKEN[%conta%]!"
if not defined TOKEN (
  echo Conta invalida.
  pause
  goto :eof
)

echo Configurando a conta !NG_NAME[%conta%]!...
%NGROK% config add-authtoken !TOKEN!
if errorlevel 1 (
  echo Falha ao configurar o token. Veja a mensagem acima.
  pause
  goto :eof
)

:ngrok_plain
call :server
%NGROK% http 3001
goto :done

:cloudflared
call :server
set "CF=cloudflared"
if exist "bin\cloudflared.exe" set "CF=bin\cloudflared.exe"
"%CF%" tunnel --url http://localhost:3001
goto :done

:bore
call :server
bore local 3001 --to bore.pub
goto :done

:tailscale_funnel
call :server
tailscale funnel 3001
goto :done

:tailscale_serve
call :server
tailscale serve 3001
goto :done

:pinggy
call :server
ssh -p 443 -R0:127.0.0.1:3001 free.pinggy.io
goto :done

:zrok
call :server
zrok2 enable 02PSXuB7Ykn9
zrok2 share public 3001
goto :done

:server
start "WhiteBoard Server" cmd /c "npm start"
timeout /t 2 >nul
exit /b 0

:done
echo.
echo Tunel encerrado. Feche a janela "WhiteBoard Server" para parar o quadro.
pause
goto :eof

:error
echo Falha ao gerar o build. Veja a mensagem acima.
pause
exit /b 1
