.PHONY: install lint typecheck test build verify clean db db-reset db-migrate constitution-gate bundle-size api-shape-test design-export design-lint verify-design

# Root-level orchestration. apps/* have their own package.json + scripts.

# ----- bootstrap -----
install:
	cd apps/frontend && npm install --ignore-scripts
	cd apps/api      && npm install --ignore-scripts

# ----- frontend -----
lint-frontend:
	cd apps/frontend && npm run lint
typecheck-frontend:
	cd apps/frontend && npm run typecheck
test-frontend:
	cd apps/frontend && npm run test -- --run
build-frontend:
	cd apps/frontend && npm run build

# ----- api -----
lint-api:
	cd apps/api && npm run lint
typecheck-api:
	cd apps/api && npm run typecheck
test-api:
	cd apps/api && npm run test -- --run
build-api-docker:
	cd apps/api && docker build -t hl-markets-api:dev .

# ----- aggregate ----
lint:       lint-frontend lint-api
typecheck:  typecheck-frontend typecheck-api
test:       test-frontend test-api
build:      build-frontend build-api-docker

# ----- Postgres (local) -----
# Prefer `docker compose` (v2 plugin); fall back to standalone `docker-compose`
# binary when the plugin isn't registered (common with `brew install docker-compose`).
DOCKER_COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

db:
	$(DOCKER_COMPOSE) up -d postgres
db-stop:
	$(DOCKER_COMPOSE) stop postgres
db-reset:
	$(DOCKER_COMPOSE) down -v
	$(DOCKER_COMPOSE) up -d postgres

# ----- Drizzle migrations -----
db-generate:
	cd apps/api && npm run db:generate
db-migrate:
	cd apps/api && npm run db:migrate
db-studio:
	cd apps/api && npm run db:studio

# ----- API dev -----
api-dev:
	cd apps/api && npm run dev

# ----- Constitution gate -----
constitution-gate:
	@echo "== I.  no privateKey / mnemonic in api source =="
	@! grep -rnE "privateKey|mnemonic|MNEMONIC" apps/api/src/ 2>/dev/null | grep -vE "(_test\.ts|comment|//)" \
		|| (echo "  violation above"; exit 1)
	@echo "  ok"
	@echo "== II/III. no DB write in GET handlers =="
	@! grep -rnE "(app|router)\.(get|GET)" apps/api/src/routes/ 2>/dev/null | grep -B1 "(insert|update|delete)" \
		|| (echo "  GET handler doing db write"; exit 1)
	@echo "  ok"
	@echo "== IV. NetworkTabs has no default =="
	@if [ -f apps/frontend/components/NetworkTabs.tsx ]; then \
		! grep -nE "defaultValue|defaultChecked" apps/frontend/components/NetworkTabs.tsx 2>/dev/null \
			|| (echo "  NetworkTabs has default"; exit 1); \
	fi
	@echo "  ok"
	@echo "== V. governance renderer registry, not switch =="
	@! grep -rnE "switch\s*\(\s*variant" apps/frontend/components/ apps/frontend/app/ 2>/dev/null \
		|| (echo "  hardcoded variant switch"; exit 1)
	@echo "  ok"
	@echo "== VII. only brand tokens (no hex colors hardcoded in tsx outside tailwind.config) =="
	@! grep -rnE "#[0-9a-fA-F]{3,8}" apps/frontend/app/ apps/frontend/components/ 2>/dev/null | grep -vE "(SHA|sha|hex|0x|hash)" \
		| head -1 | grep -q . && (echo "  hex color hardcoded in tsx — use tailwind tokens"; exit 1) || true
	@echo "  ok"
	@echo "== VIII. no analytics SDKs =="
	@! grep -rnE "google-analytics|sentry|@sentry|googletagmanager|datadog-rum" \
		apps/frontend/ apps/api/src/ --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null \
		| grep -v node_modules \
		| head -1 | grep -q . && (echo "  analytics SDK import"; exit 1) || true
	@echo "  ok"
	@echo "== IX. no aws-cdk / aws-sdk import =="
	@! grep -rnE "aws-cdk-lib|@aws-sdk" apps/ --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null \
		| grep -v node_modules \
		| head -1 | grep -q . && (echo "  aws-* import in apps/"; exit 1) || true
	@echo "  ok"
	@echo "== gate OK =="

# ----- bundle size -----
bundle-size:
	@if [ ! -d apps/frontend/out ]; then \
		echo "apps/frontend/out missing — run 'make build-frontend' first"; exit 1; \
	fi
	@total=$$(find apps/frontend/out -name '*.js' -o -name '*.css' | xargs gzip -c | wc -c); \
		mb=$$(echo $$total | awk '{printf "%.3f", $$1/1048576}'); \
		echo "frontend gzip: $$mb MB (target < 1.5 MB)"; \
		test $$total -lt 1572864 || (echo "  BUNDLE TOO LARGE"; exit 1)

# ----- api shape test (zod schemas vs contracts/api.md) — Phase E+ -----
api-shape-test:
	@echo "(stub) — to be implemented when api routes are written"

# ----- DESIGN.md v1 (Phase W) -----
# Single source of truth (Constitution D-IV). 토큰 변경은 DESIGN.md 부터 →
# `make design-export` 로 `apps/frontend/tailwind.theme.generated.json` 재생성
# → re-build.

design-export:
	npx --yes @google/design.md@latest export --format json-tailwind DESIGN.md \
		> apps/frontend/tailwind.theme.generated.json
	@echo "  exported $$(wc -c < apps/frontend/tailwind.theme.generated.json) bytes"

design-lint:
	@npx --yes @google/design.md@latest lint DESIGN.md > /tmp/design-lint.json
	@cat /tmp/design-lint.json | python3 -c "import json,sys;d=json.load(sys.stdin);print('errors:',d['summary']['errors'],'/ warnings:',d['summary']['warnings'],'/ infos:',d['summary']['infos']);sys.exit(1 if d['summary']['errors']>0 else 0)"

# Constitution D-X — design drift detector. 코드에서 hex literal 직접 사용 0건
# (DESIGN.md, tailwind.config, tailwind.theme.generated.json, globals.css 의
# CSS variable mirror, hash/SHA 류 라벨은 제외). D-014 의 visual drift 결판.
verify-design: design-lint
	@echo "== W-6. design drift (hardcoded hex in *.tsx / *.ts under app|components|lib) =="
	@! grep -rnE "#[0-9a-fA-F]{3,8}" \
		apps/frontend/app apps/frontend/components apps/frontend/lib \
		--include='*.ts' --include='*.tsx' 2>/dev/null \
		| grep -vE "(SHA|sha|hex|0x|hash|tnum|//.*color|@deprecated)" \
		| head -1 | grep -q . && (echo "  hex literal in app/components/lib — use DESIGN.md token"; exit 1) || true
	@echo "  ok"

# ----- aggregate verify -----
verify: lint typecheck test build constitution-gate bundle-size verify-design
	@echo "== verify all green =="

clean:
	rm -rf apps/frontend/node_modules apps/frontend/.next apps/frontend/out
	rm -rf apps/api/node_modules apps/api/dist
	docker compose down -v 2>/dev/null || true
