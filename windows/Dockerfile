# Environment-check agent container — WINDOWS CONTAINERS edition.
#
# This is the Windows-container twin of ../verify/Dockerfile. It exists because a
# Docker daemon in Windows-container mode cannot run Linux images at all: the Linux
# check stack fails at the first pull with
#   no matching manifest for windows(10.0.x)/amd64 in the manifest list entries
# and one daemon cannot serve both modes at once, so "just switch to Linux
# containers" is not available to someone whose other work needs Windows images.
#
# It is deliberately the same SHAPE as the Linux check container (browser + Claude
# Code CLI + non-admin user), so a pass here proves the same things. Where it
# differs, it differs because Windows forces it — each one is commented.
#
# Base: plain Server Core, NOT dotnet/framework/sdk. The workshop needs Node and a
# browser, not MSBuild, and the Framework SDK base costs a 9.4 GB pull and is the
# one Windows base that does NOT ship a ContainerUser account.
FROM mcr.microsoft.com/windows/servercore:ltsc2022

# Fail fast on any error in the RUN layers below, and keep progress bars out of the
# build log (they render as megabytes of control characters).
SHELL ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';"]

# !! HOUSE RULE FOR EVERY SHELL-FORM `RUN` BELOW: never use a double quote.
# Docker folds a shell-form RUN into the SHELL's trailing -Command argument and
# wraps the result in double quotes, so any " INSIDE the RUN terminates that
# quoting early and is stripped. `"$p;$add"` reaches PowerShell as bare $p;$add and
# dies with "Missing ')' in method call" — which reads like a PowerShell bug and is
# really a quoting one.
# Use single-quoted strings and concatenate: ($p + ';' + $add).
# ENV / ARG / SHELL / ENTRYPOINT / COPY are parsed by Docker itself and are fine.
# This is also why package.json is COPYd rather than written by a RUN — JSON is all
# double quotes.

ARG NODE_VERSION=22.20.0

# --- Node.js ------------------------------------------------------------------
# Installed from the official zip rather than via Chocolatey. Chocolatey would drag
# in a package manager to install one runtime, and its package names are a known
# drift risk. A pinned zip is smaller and exact.
#
# Expand-Archive is NOT used: it hard-crashes PowerShell on Server Core base images
# (exit 255, and not as a catchable exception). ZipFile::ExtractToDirectory works.
#
# The icacls lines are NOT belt-and-braces, they are the fix for a real failure.
# Move-Item PRESERVES THE SOURCE ACL rather than inheriting from the destination
# parent, so a directory extracted under C:\Windows\Temp and then moved to C:\ keeps
# Temp's restrictive permissions. Result: node.exe is present and on PATH, and
# ContainerUser cannot see it - `node --version` fails with "not recognized" while
# the identical lookup for claude (whose C:\npm-global was created in place, and so
# inherited C:\) succeeds. That asymmetry is very confusing to debug from the
# symptom, so the grant lives here next to its cause. /reset re-establishes
# inheritance from C:\; the grant then matches every other directory in this image.
RUN $url = 'https://nodejs.org/dist/v' + $env:NODE_VERSION + '/node-v' + $env:NODE_VERSION + '-win-x64.zip'; \
    $zip = 'C:\Windows\Temp\node.zip'; \
    Write-Host ('downloading ' + $url); \
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; \
    Add-Type -AssemblyName System.IO.Compression.FileSystem; \
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, 'C:\Windows\Temp\nodeout'); \
    Move-Item ('C:\Windows\Temp\nodeout\node-v' + $env:NODE_VERSION + '-win-x64') 'C:\nodejs'; \
    Remove-Item $zip, 'C:\Windows\Temp\nodeout' -Recurse -Force; \
    icacls C:\nodejs /reset /T /C /Q | Out-Null; \
    icacls C:\nodejs /grant '*S-1-5-93-2-2:(OI)(CI)RX' | Out-Null; \
    $p = [Environment]::GetEnvironmentVariable('PATH','Machine'); \
    [Environment]::SetEnvironmentVariable('PATH', ($p + ';C:\nodejs'), 'Machine'); \
    Write-Host 'node installed'

# npm global prefix -> a MACHINE-WIDE path.
# Load-bearing, not tidiness: on Windows `npm install --global` defaults to the
# INSTALLING user's %APPDATA%\npm. These layers run as ContainerAdministrator but
# the container runs as ContainerUser, so a global CLI would install somewhere
# ContainerUser cannot see — the image builds clean, then fails at runtime with
# "claude: not found".
ENV NPM_CONFIG_PREFIX="C:\npm-global"
RUN New-Item -ItemType Directory -Force -Path C:\npm-global | Out-Null; \
    $p = [Environment]::GetEnvironmentVariable('PATH','Machine'); \
    [Environment]::SetEnvironmentVariable('PATH', ($p + ';C:\npm-global'), 'Machine')

# --- Fonts --------------------------------------------------------------------
# The Server Core base ships exactly ONE font (lucon.ttf, Lucida Console). Without
# this layer every page renders in monospace and the screenshot looks nothing like
# the page an attendee sees in their own browser — misleading rather than
# wrong-loudly, which is worse for a check whose whole job is to be believable.
#
# Chocolatey's dejavufonts package fails here with RPC_E_SERVERFAULT: Server Core
# has no Shell COM 'Fonts' namespace, so the only method that works is
# copy-the-file + write-the-registry-value.
#
# The FontSubstitutes map then points the fonts real pages actually ask for at the
# DejaVu faces. Without it a page asking for Arial or Segoe UI — which the workshop
# page does — falls through to the default serif.
RUN $url = 'https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip'; \
    $zip = 'C:\Windows\Temp\dejavu.zip'; \
    $dst = 'C:\Windows\Temp\dejavu'; \
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; \
    Add-Type -AssemblyName System.IO.Compression.FileSystem; \
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dst); \
    $reg = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'; \
    foreach ($f in (Get-ChildItem $dst -Recurse -Filter *.ttf)) { \
        Copy-Item $f.FullName (Join-Path $env:SystemRoot 'Fonts') -Force; \
        New-ItemProperty -Path $reg -Name ($f.BaseName + ' (TrueType)') -Value $f.Name -PropertyType String -Force | Out-Null \
    }; \
    Remove-Item $zip, $dst -Recurse -Force; \
    $sub = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes'; \
    $map = @{ \
        'Arial'           = 'DejaVu Sans'; \
        'Helvetica'       = 'DejaVu Sans'; \
        'Segoe UI'        = 'DejaVu Sans'; \
        'Tahoma'          = 'DejaVu Sans'; \
        'Verdana'         = 'DejaVu Sans'; \
        'Times New Roman' = 'DejaVu Serif'; \
        'Georgia'         = 'DejaVu Serif'; \
        'Courier New'     = 'DejaVu Sans Mono'; \
        'Consolas'        = 'DejaVu Sans Mono' \
    }; \
    foreach ($k in $map.Keys) { \
        New-ItemProperty -Path $sub -Name $k -Value $map[$k] -PropertyType String -Force | Out-Null \
    }; \
    Write-Host ('fonts installed: ' + (Get-ChildItem (Join-Path $env:SystemRoot 'Fonts') -Filter *.ttf).Count)

# --- Playwright + FIREFOX -----------------------------------------------------
# FIREFOX, NOT CHROMIUM. Measured on a real Windows host, and not a matter of
# configuration:
#   * Chromium starts and answers --version, then dies on any actual render.
#     chrome-headless-shell.exe exits 0xC00000FD STATUS_STACK_OVERFLOW; chrome.exe
#     exits 0x80000003 STATUS_BREAKPOINT. Through the Playwright API this surfaces
#     as the misleading "Target page, context or browser has been closed".
#   * It is NOT fonts, NOT memory, NOT flags. All were ruled out by measurement:
#     22 real TTFs left the crash byte-identical, 4.5 GB / 4 CPUs changed nothing,
#     and six flag combinations (single-process, no-zygote, headless=old,
#     headless=new, no software rasterizer) all failed identically. The remaining
#     suspect is the Server Core App-Compatibility FOD, which is not practically
#     installable in a container.
#   * FIREFOX RENDERS CORRECTLY on this base — verified end to end with a legible
#     screenshot before this file was written.
# Treat Chromium here as unsupported, not untested. Do not "fix" this back to
# Chromium without a rendered PNG to prove it.
ENV PLAYWRIGHT_BROWSERS_PATH="C:\playwright-browsers" \
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
    PW_BROWSER=firefox

# Playwright is installed LOCALLY into C:\app, not globally, and that is the whole
# reason the check scripts can import it: NODE_PATH applies only to CommonJS
# `require`, NOT to ESM `import`. A globally-installed playwright is simply not
# importable from an .mjs file — you get "ERR_MODULE_NOT_FOUND: Cannot find package
# 'playwright'" no matter what NODE_PATH says. A local node_modules next to the
# scripts is the fix. (The Linux image sets NODE_PATH and its screenshot.mjs is an
# ESM module, which is worth re-checking over there.)
WORKDIR C:/app
COPY windows/src/package.json C:/app/package.json

# `playwright install` is wrapped because it can report a non-zero/noisy result and
# still have installed correctly. The real gate is the firefox.exe existence check,
# which throws — so a missing browser fails the BUILD loudly rather than leaving
# check 5 to fail mysteriously for every attendee.
RUN npm install --omit=dev --no-audit --no-fund; \
    try { npx --no-install playwright install firefox } catch { \
        Write-Host ('playwright install reported: ' + $_.Exception.Message) \
    }; \
    if (-not (Get-ChildItem $env:PLAYWRIGHT_BROWSERS_PATH -Recurse -Filter 'firefox.exe' -ErrorAction SilentlyContinue)) { \
        throw 'Playwright firefox did not install - check 5 would be silently broken' \
    }; \
    Write-Host 'playwright firefox installed'

# --- Claude Code CLI ----------------------------------------------------------
# Lands in C:\npm-global because of NPM_CONFIG_PREFIX above.
RUN npm install --global @anthropic-ai/claude-code --no-audit --no-fund; \
    Write-Host 'claude code installed'

COPY windows/src/serve.mjs windows/src/screenshot.mjs C:/app/

# --- Directories + ACLs -------------------------------------------------------
# GRANT THE SID *S-1-5-93-2-2, NOT THE NAME 'ContainerUser'. Two principals answer
# to that name: the well-known container virtual account the process actually runs
# as (S-1-5-93-2-2, which whoami shows as User Manager\ContainerUser), and any
# local account of the same name. Granting the name hands rights to an identity the
# running process does not hold — the grant looks applied and does nothing.
#
# These layers run as ContainerAdministrator; a directory created here is not
# writable by ContainerUser without the grant, and check 5 would fail writing its
# screenshot.
RUN New-Item -ItemType Directory -Force -Path C:\screenshots, C:\site, C:\apptemp | Out-Null; \
    icacls C:\screenshots /grant '*S-1-5-93-2-2:(OI)(CI)M' | Out-Null; \
    icacls C:\apptemp     /grant '*S-1-5-93-2-2:(OI)(CI)M' | Out-Null; \
    icacls C:\app         /grant '*S-1-5-93-2-2:(OI)(CI)RX' | Out-Null; \
    icacls C:\npm-global  /grant '*S-1-5-93-2-2:(OI)(CI)RX' | Out-Null; \
    icacls C:\playwright-browsers /grant '*S-1-5-93-2-2:(OI)(CI)RX' | Out-Null

# PIN THE PROFILE. ContainerUser has no registered Windows profile, so the logon
# that starts the container falls back to a TEMPORARY one at C:\Users\TEMP, which is
# discarded when the container stops. Anything keyed off %USERPROFILE% —
# ~/.claude/settings.json, whatever `claude login` writes — silently goes there and
# is lost on restart, while a declared volume sits empty. Docker builds the process
# environment block, so these win over what the logon session would supply.
#
# TEMP/TMP are pinned too: a browser puts its profile under %TEMP%, and unpinned
# that is the same throwaway C:\Users\TEMP path.
ENV USERPROFILE="C:\Users\ContainerUser" \
    HOMEDRIVE="C:" \
    HOMEPATH="\Users\ContainerUser" \
    APPDATA="C:\Users\ContainerUser\AppData\Roaming" \
    LOCALAPPDATA="C:\Users\ContainerUser\AppData\Local" \
    TEMP="C:\apptemp" \
    TMP="C:\apptemp"

# Server Core ships a ContainerUser account (the Framework SDK images do not), but
# its profile directories do not exist until first logon — create them now so the
# pinned USERPROFILE above points at something writable.
RUN New-Item -ItemType Directory -Force -Path C:\Users\ContainerUser\AppData\Roaming, C:\Users\ContainerUser\AppData\Local | Out-Null; \
    icacls C:\Users\ContainerUser /grant '*S-1-5-93-2-2:(OI)(CI)F' | Out-Null

# Claude Code refuses to run with skipped permissions as an administrator, and the
# workshop relies on that mode. This is the Windows analogue of the Linux image's
# `USER pwuser`. It is NOT equivalent hardening — Windows containers have no
# cap_drop, no no-new-privileges and no read-only rootfs — but it is a non-admin
# account. See README.md in this folder for the honest security delta.
USER ContainerUser

# No default command — verify.ps1 invokes each check explicitly so it can report
# them as separate lines.
CMD ["node", "--version"]
