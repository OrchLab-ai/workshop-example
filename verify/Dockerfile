# Environment-check agent container.
#
# Deliberately the same shape as the workshop container proper (Playwright base +
# Claude Code CLI + non-root user), so that a passing check actually proves the
# thing the workshop needs — not a simpler stand-in that passes when the real
# container would fail.
#
# THE TAG MUST MATCH app/autonomous/Dockerfile, and it is not cosmetic. This base
# layer is ~2 GB. When the two drifted (1.49.1 here, 1.58.2 there) an attendee
# downloaded it TWICE: once the night before for a check that proved nothing about
# the morning, and again at 09:05 when the workshop stack pulled the one it actually
# uses. Sharing the tag is what makes the check's download the workshop's download.
# tests/run-tests.mjs fails if these two ever diverge again.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Pin to the base image's Playwright version. A mismatch here is the classic
# "browser not found at runtime" failure: the npm package looks for a browser
# revision the preinstalled /ms-playwright never shipped.
ARG PLAYWRIGHT_VERSION=1.58.2

RUN npm install -g \
      playwright@${PLAYWRIGHT_VERSION} \
      @anthropic-ai/claude-code \
    && npm cache clean --force

# Claude Code refuses to run with skipped permissions as root, and the workshop
# relies on that mode. pwuser ships with the Playwright base image.
RUN mkdir -p /screenshots /work && chown -R pwuser:pwuser /screenshots /work

# Put the global install on the MODULE RESOLUTION path, which NODE_PATH below does
# not do. NODE_PATH is honoured only by the CommonJS resolver (require); the ESM
# resolver ignores it completely and walks node_modules up from the importing file.
# screenshot.mjs is ESM and imports "playwright" by bare specifier, so with only
# NODE_PATH set it failed on EVERY platform with:
#   ERR_MODULE_NOT_FOUND: Cannot find package 'playwright' imported from /work/screenshot.mjs
# (/work/node_modules and /node_modules are both absent on this base image.)
#
# A symlink rather than a second `npm install` in /work: it costs nothing, and it
# keeps ONE pinned copy of playwright. A local install would be a second version
# free to drift from the base image's browser revision — exactly the
# "browser not found at runtime" failure the ARG above exists to prevent.
RUN ln -s /usr/lib/node_modules /work/node_modules

# Kept for CommonJS callers (and anything the workshop adds later that uses
# require). It is NOT what makes the ESM import above resolve — the symlink is.
ENV NODE_PATH=/usr/lib/node_modules
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /work
USER pwuser
