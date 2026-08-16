# Environment-check agent container.
#
# Deliberately the same shape as the workshop container proper (Playwright base +
# Claude Code CLI + non-root user), so that a passing check actually proves the
# thing the workshop needs — not a simpler stand-in that passes when the real
# container would fail.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Pin to the base image's Playwright version. A mismatch here is the classic
# "browser not found at runtime" failure: the npm package looks for a browser
# revision the preinstalled /ms-playwright never shipped.
ARG PLAYWRIGHT_VERSION=1.49.1

RUN npm install -g \
      playwright@${PLAYWRIGHT_VERSION} \
      @anthropic-ai/claude-code \
    && npm cache clean --force

# Claude Code refuses to run with skipped permissions as root, and the workshop
# relies on that mode. pwuser ships with the Playwright base image.
RUN mkdir -p /screenshots /work && chown -R pwuser:pwuser /screenshots /work

ENV NODE_PATH=/usr/lib/node_modules
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /work
USER pwuser
