.PHONY: help install install-server install-app install-bridge \
        server server-dev app app-dev bridge dev

# ── Defaults ──────────────────────────────────────────────────────────────────

help:
	@echo "Unity WebSocket Stack"
	@echo ""
	@echo "  make install       Install all dependencies"
	@echo "  make dev           Run server + frontend in parallel (dev mode)"
	@echo ""
	@echo "  make server-dev    WebSocket server  — development (hot-reload)"
	@echo "  make server        WebSocket server  — production"
	@echo "  make app-dev       Next.js frontend  — development"
	@echo "  make app           Next.js frontend  — production build + start"
	@echo "  make bridge        Serial bridge     — Python (Arduino USB → WS)"
	@echo ""
	@echo "  make install-server   Install server deps only"
	@echo "  make install-app      Install frontend deps only"
	@echo "  make install-bridge   Install bridge deps only"

# ── Install ───────────────────────────────────────────────────────────────────

install: install-server install-app install-bridge

install-server:
	cd server && npm install

install-app:
	cd app && npm install

install-bridge:
	cd tcp-bridge && pip install -r requirements.txt

# ── Run ───────────────────────────────────────────────────────────────────────

server-dev:
	cd server && npm run dev

server:
	cd server && npm start

app-dev:
	cd app && npm run dev

app:
	cd app && npm run build && npm start

bridge:
	cd tcp-bridge && python bridge.py

# Run server and frontend together (requires a shell that supports & + wait).
dev:
	@echo "Starting server and frontend in parallel…"
	@cd server && npm run dev & \
	 cd app && npm run dev & \
	 wait
