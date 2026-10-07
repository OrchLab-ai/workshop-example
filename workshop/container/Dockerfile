# The workshop container: Claude Code + Playwright MCP + the app's toolchain.
# docker-compose.workshop.yml builds claude-container from this file.
#
# It lives in this repo, not in app/, on purpose: ./checkpoint.sh rewinds app/ to a cp-*
# tag, so an image built from app/ would be whatever that checkpoint's copy said. Here it
# is the same image whichever rung the attendee is on. start-app.sh, beside it, is the
# entrypoint that turns this image into the workshop container.
# Base includes browser deps + Node.js (Ubuntu Noble)
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    lsof \
    sudo \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# DBMate — database migration tool
RUN curl -fsSL https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64 \
      -o /usr/local/bin/dbmate \
  && chmod +x /usr/local/bin/dbmate

# Claude Code CLI + Playwright MCP server (global)
# Base image ships Node 20 + npm 10; npm workspaces are fully supported — npm ci works in monorepos.
RUN npm install -g @anthropic-ai/claude-code @playwright/mcp

# Non-root user — Claude Code refuses --dangerously-skip-permissions as root
RUN useradd -m -s /bin/bash agent \
  && echo "agent ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Pre-create ~/.claude so Docker volume mounts don't create it as root.
# Without this, mounting .mcp.json to /home/agent/.claude/.mcp.json causes
# Docker to create the .claude/ directory owned by root, which blocks
# Claude Code's Bash tool (session-env) and MCP config reads.
RUN mkdir -p /home/agent/.claude \
  && chown -R agent:agent /home/agent

WORKDIR /workspace
RUN chown agent:agent /workspace

# Trust the bind-mounted app repo. On Windows (Docker Desktop's WSL 2 file sharing)
# every file under ./app appears owned by root, not by agent, and git then refuses
# to touch it: "fatal: detected dubious ownership in repository at
# '/workspace/repo'". That broke git, ci-check and Claude's commits in the container
# for every Windows attendee while macOS - whose file sharing presents files as the
# container user's - never saw it. System-level, so it holds for any user here.
RUN git config --system --add safe.directory /workspace/repo

USER agent

# Install Chromium using the MCP server's bundled Playwright, not the system one.
# @playwright/mcp bundles its own playwright-core which may expect a different
# browser revision than the system Playwright. Using its bundled copy ensures
# the installed browser matches what the MCP server will look for at runtime.
# Placed before COPY steps so script/prompt edits don't bust this cache layer.
RUN node /usr/lib/node_modules/@playwright/mcp/node_modules/playwright-core/cli.js install chromium

# The app's own Playwright (@playwright/test in app/package.json) needs the browser build for
# ITS version, for ./scripts/run-e2e.sh and anything else that launches Chromium from the
# repo. The install above deletes browser builds no registered install claims, which
# removes the base image's, so install the app's build too, after it. Keep this version in
# step with @playwright/test in app/package.json and the FROM tag.
RUN npx -y playwright@1.58.2 install chromium

# No entrypoint of its own. docker-compose.workshop.yml runs start-app.sh in this image;
# on its own the container simply stays up so a shell can be opened in it.
CMD ["sleep", "infinity"]
