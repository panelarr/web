# Self-documenting Makefile: `make` or `make help` lists every target with a `## description`.
.DEFAULT_GOAL := help

PNPM ?= pnpm
# The server clone the API spec is copied from (`make spec-sync`).
SERVER_REPO ?= ../server
export SERVER_REPO

.PHONY: help setup build test e2e e2e-webkit lint fmt typecheck gen gen-check spec-sync spec-check run run-mock preview clean check

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install dependencies (from the lockfile) and the Playwright browser
	$(PNPM) install --frozen-lockfile
	$(PNPM) exec playwright install chromium

build: ## Build the app into dist/ and check it is safe under a strict CSP
	$(PNPM) build

test: ## Run the unit and component tests
	$(PNPM) test

e2e: ## Run the Playwright smoke tests (desktop and phone) against the mock server
	$(PNPM) e2e

e2e-webkit: ## The reader's tests on iOS Safari's engine too (needs `pnpm exec playwright install webkit`)
	E2E_WEBKIT=1 $(PNPM) e2e --project phone-webkit

lint: ## Lint and check formatting (Biome)
	$(PNPM) lint

fmt: ## Format and fix what Biome can
	$(PNPM) fmt

typecheck: ## Type-check (tsc --noEmit)
	$(PNPM) typecheck

gen: ## Generate the API types from api/openapi.yaml and api/drafts/
	$(PNPM) gen:api

gen-check: ## Fail if the generated API types are out of date
	$(PNPM) gen:api:check

spec-sync: ## Copy the server's API spec from $(SERVER_REPO) (main), then regenerate
	$(PNPM) spec:sync
	$(PNPM) gen:api

spec-check: ## Fail if api/openapi.yaml differs from the server's main
	$(PNPM) spec:check

run: ## Dev server against a real Panelarr server (PANELARR_BACKEND, default http://localhost:8900); draft endpoints are mocked
	$(PNPM) dev

run-mock: ## Dev server with the whole API mocked (no server needed)
	$(PNPM) dev:mock

preview: build ## Serve the production build locally
	$(PNPM) preview

clean: ## Remove build output and test reports
	rm -rf dist dev-dist coverage playwright-report test-results

check: lint gen-check build typecheck test ## Lint, generated code, build (with the CSP check), types and tests: run before every report/PR
