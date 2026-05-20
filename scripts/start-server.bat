@echo off
:: 백엔드 서버 + Cloudflare Tunnel 동시 실행

start "Backend Server" cmd /k "cd /d D:\naver-estate-web\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8002"
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run naver-estate-backend"
