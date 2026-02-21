SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup install dev build check env-doctor env-sync env-sync-prod deploy deploy-prod logs logs-prod vercel-init-check vercel-preview vercel-deploy

help: ## Show available Make targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "%-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Validate toolchain and bootstrap local env templates
	@for cmd in node npm npx rg make; do \
		if ! command -v $$cmd >/dev/null 2>&1; then \
			echo "Missing required tool: $$cmd" >&2; \
			exit 1; \
		fi; \
	done
	@if command -v convex >/dev/null 2>&1; then \
		echo "Found convex CLI in PATH"; \
	else \
		echo "convex CLI not in PATH; using npx convex"; \
		npx convex --help >/dev/null; \
	fi
	@if command -v vercel >/dev/null 2>&1; then \
		echo "Found vercel CLI in PATH"; \
	else \
		echo "vercel CLI not in PATH; using npx vercel for Vercel tasks"; \
		npx vercel --version >/dev/null; \
	fi
	@if [[ ! -f .env.local ]]; then cp .env.local.example .env.local; fi
	@if [[ ! -f .env.convex.local ]]; then cp .env.convex.local.example .env.convex.local; fi
	@echo "Setup complete. Review .env.local and .env.convex.local before syncing/deploying."

install: ## Install dependencies (npm ci, fallback to npm install)
	@npm ci || npm install

dev: ## Run local frontend dev server
	@npm run dev

build: ## Build frontend bundle
	@npm run build

check: ## Run build + Convex typecheck dry-run
	@npm run build
	@npx convex codegen --typecheck enable --dry-run

env-doctor: ## Validate merged Convex env for dev (override with TARGET=prod)
	@TARGET=$${TARGET:-dev}; ./scripts/convex-env-doctor.sh --target $$TARGET

env-sync: ## Sync required Convex env keys to dev (upsert-only)
	@./scripts/convex-env-sync.sh --target dev

env-sync-prod: ## Sync required Convex env keys to prod (upsert-only)
	@./scripts/convex-env-sync.sh --target prod

deploy: ## Validate and deploy Convex functions to dev
	@$(MAKE) env-doctor TARGET=dev
	@$(MAKE) check
	@npx convex dev --once

deploy-prod: ## Validate and deploy Convex functions to prod
	@$(MAKE) env-doctor TARGET=prod
	@$(MAKE) check
	@npx convex deploy

logs: ## Tail Convex logs for dev deployment
	@npx convex logs

logs-prod: ## Tail Convex logs for prod deployment
	@npx convex logs --prod

vercel-init-check: ## Validate Vercel CLI and SPA routing config
	@if command -v vercel >/dev/null 2>&1; then \
		echo "Found vercel CLI in PATH"; \
	else \
		echo "vercel CLI not in PATH; using npx vercel"; \
		npx vercel --version >/dev/null; \
	fi
	@test -f vercel.json || (echo "Missing vercel.json" >&2; exit 1)
	@echo "Vercel config looks good."

vercel-preview: vercel-init-check ## Deploy frontend to Vercel preview
	@npx vercel deploy

vercel-deploy: vercel-init-check ## Deploy frontend to Vercel production
	@npx vercel deploy --prod
