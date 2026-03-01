.PHONY: all
all: format check test

.PHONY: format
format:
	npm run format

.PHONY: check
check:
	npm run check

.PHONY: test
test:
	npm run test

