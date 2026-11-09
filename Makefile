PY      := /opt/homebrew/bin/python3.11
VENV    := pipeline/.venv
BIN     := $(VENV)/bin

.PHONY: setup-pipeline test-pipeline lint-pipeline typecheck-pipeline format-pipeline test-app test

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

test-app:
	@echo "App tests are added in Part 7" && exit 1

test: test-pipeline
