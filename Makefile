PY      ?= /opt/homebrew/bin/python3.11
VENV    := pipeline/.venv
BIN     := $(VENV)/bin

.PHONY: setup-pipeline test-pipeline lint-pipeline typecheck-pipeline format-pipeline lint-workflows \
	setup-app test-app lint-app typecheck-app verify-feed test check

setup-pipeline:
	test -d $(VENV) || $(PY) -m venv $(VENV)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -e 'pipeline[dev]'

test-pipeline:
	cd pipeline && .venv/bin/pytest

lint-pipeline:
	$(BIN)/ruff check pipeline
	$(BIN)/ruff format --check pipeline

typecheck-pipeline:
	cd pipeline && .venv/bin/mypy

format-pipeline:
	$(BIN)/ruff check --fix pipeline
	$(BIN)/ruff format pipeline

lint-workflows:
	actionlint

setup-app:
	cd app && npm ci

test-app:
	cd app && npm test

lint-app:
	cd app && npm run lint

typecheck-app:
	cd app && npm run typecheck

test: test-pipeline test-app

verify-feed:
	cd app && npm run verify:feed

# Everything: pipeline tests, lint and types; app lint, types and tests; live feed contract check.
check: lint-pipeline typecheck-pipeline test-pipeline lint-app typecheck-app test-app verify-feed
