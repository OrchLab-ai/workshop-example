<#
    OrchLab Workshop - Environment Check (WINDOWS CONTAINERS edition)

    The Windows-container twin of ../verify-setup.sh. Run this instead of verify-setup.sh when
    your Docker Desktop is in Windows-container mode.

    Design note, inherited deliberately from verify-setup.sh: every intermediate command
    is silenced and logged to .verify-logs\. The problem this script exists to solve
    is not that checks fail - it is that a wall of streamed container output makes
    SUCCESS indistinguishable from FAILURE. So the only thing on screen is a
    fixed-length checklist and one unambiguous verdict.

    Targets Windows PowerShell 5.1, because that is what is on a stock Windows host.
    No pwsh-only syntax (no ternary, no ??, no && chaining).

    This file is saved WITH a UTF-8 BOM on purpose: powershell.exe 5.1 decodes a
    BOM-less file as Windows-1252, which would mojibake any non-ASCII character.
    The output strings are kept ASCII-only as a second line of defence.
#>
[CmdletBinding()]
param(
    # Suppress the banner; print only the final verdict line. For facilitators
    # sweeping a room.
    [switch]$Quiet,
    # Leave the check containers running afterwards.
    [switch]$Keep,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    @'
Usage: .\verify.ps1 [options]

  -Quiet    Suppress the banner; print only the final verdict line.
            Intended for facilitators sweeping a room.
  -Keep     Leave the check containers running afterwards.
  -Help     Show this message.

Environment:
  WORKSHOP_PORT       Host port for the site, check and workshop alike (default 5173)
  WINDOWS_ISOLATION   hyperv (default) or process
  WINDOWS_MEMORY      Memory limit for the agent container (default 4g)

Exit code is 0 only when all checks pass.
'@ | Write-Host
    exit 0
}

# ---------------------------------------------------------------- configuration

$Total        = 6
$RepoRoot     = Split-Path -Parent $PSScriptRoot
# The application attendees work on. It lives in its own repository so that its
# history (the cp-* ladder) moves independently of this one - see
# checkpoints\README.md. Kept byte-identical in meaning to verify-setup.sh.
$AppDir       = if ($env:WORKSHOP_APP_DIR) { Join-Path $RepoRoot $env:WORKSHOP_APP_DIR } else { Join-Path $RepoRoot 'app' }
$AppRepo      = if ($env:WORKSHOP_APP_REPO) { $env:WORKSHOP_APP_REPO } else { 'https://github.com/OrchLab-ai/mars-mission-fund.git' }
$ComposeFile  = Join-Path $PSScriptRoot 'docker-compose.windows.yml'
# An explicit project name. Without it compose derives one from this folder
# ("windows"), which is both meaningless in `docker ps` and a collision risk
# against any other checkout on the same host.
$Project      = 'orchlab-workshop-win'
$LogDir       = Join-Path $RepoRoot '.verify-logs'
$Report       = Join-Path $RepoRoot 'verify-report.txt'
$ShotRelative = 'screenshots\verify.png'
$Screenshot   = Join-Path $RepoRoot $ShotRelative
$Rule         = '============================================================'

# ----------------------------------------------------------------- presentation

# Colour only when we are on a real console and not in quiet mode. 5.1 has no
# $PSStyle, so use raw ANSI - every supported Windows 10+ console handles it.
$useColour = (-not $Quiet) -and (-not $env:NO_COLOR) -and ($Host.UI.RawUI -ne $null)
if ($useColour) {
    $e = [char]27
    $BOLD = "$e[1m"; $DIM = "$e[2m"; $GREEN = "$e[32m"; $RED = "$e[31m"; $RESET = "$e[0m"
} else {
    $BOLD = ''; $DIM = ''; $GREEN = ''; $RED = ''; $RESET = ''
}

# Say: to screen (unless -Quiet) and always to the report file, with colour
# stripped from the file so it can be pasted into chat.
function Say([string]$Text) {
    if (-not $Quiet) { Write-Host $Text }
    $plain = $Text -replace "$([char]27)\[[0-9;]*m", ''
    Add-Content -LiteralPath $Report -Value $plain -Encoding UTF8
}

# ------------------------------------------------------------------- machinery

$script:Idx          = 0
$script:Failed       = $false
$script:FailLabel    = ''
$script:FailCause    = ''
$script:FailFix      = ''
$script:ShotHost     = ''
$script:ShotStamp    = ''
$script:CurrentLabel = ''
$script:CurrentLine  = ''
$script:CurrentPrefix = ''
# Default to a non-zero exit. If anything prevents the verdict being reached, the
# script must NOT report success by omission.
$script:ExitCode     = 1

function Write-CheckStart([string]$Label) {
    $script:Idx++
    $padded = "$Label "
    while ($padded.Length -lt 42) { $padded += '.' }
    $script:CurrentLabel = $Label
    $script:CurrentLine  = "   [$($script:Idx)/$Total]  $padded  "
    $script:CurrentPrefix = "   [$($script:Idx)/$Total]  $Label ... "
}

function Write-CheckPass([string]$Detail = '') {
    Say "$($script:CurrentLine)${GREEN}PASS${RESET}   ${DIM}${Detail}${RESET}"
}

function Write-CheckFail([string]$Cause, [string]$Fix) {
    Say "$($script:CurrentLine)${RED}FAIL${RESET}"
    $script:Failed    = $true
    $script:FailLabel = $script:CurrentLabel
    $script:FailCause = $Cause
    $script:FailFix   = $Fix
}

# ------------------------------------------------------------------- progress
#
# Mirror of the progress block in verify-setup.sh, and there for the same reason:
# check 2 pulls a ~2 GB Windows base image on a first run, and a checklist row that
# is only printed once the check has FINISHED leaves the screen still for minutes.
# People conclude it has hung and kill it. So a long step redraws its own row in
# place with what Docker is doing, and the finished PASS/FAIL line overwrites the
# animation. Nothing is streamed, and the report file never sees any of it - a
# pasted report stays the same fixed-length checklist it always was.

# Animate only on a real console, and never under -Quiet, with output redirected, or
# in CI, where the carriage returns would pile up in a log nobody is watching live.
# [Console]::IsOutputRedirected is the .NET equivalent of bash's `[ -t 1 ]`.
$script:Progress = (-not $Quiet) -and
                   (-not $env:CI) -and
                   ($Host.UI.RawUI -ne $null) -and
                   (-not [Console]::IsOutputRedirected)

function Get-ConsoleWidth {
    # A host with no real window (the ISE, a remoting session) throws rather than
    # answering, and a progress animation must never be the thing that fails a check.
    try {
        $width = $Host.UI.RawUI.WindowSize.Width
        if ($width -ge 48) { return $width }
    } catch { }
    return 80
}

# Get-ProgressNote - one short phrase for where the step has got to, read out of the
# logs docker is still writing. Build progress goes to STDERR, so both are read.
function Get-ProgressNote([string[]]$Paths) {
    $tail = @()
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            try { $tail += @(Get-Content -LiteralPath $path -Tail 40) } catch { }
        }
    }
    if ($tail.Count -eq 0) { return 'starting' }
    $text = $tail -join "`n"
    # git clone, not docker. Check 1 clones the app repo through this same helper,
    # and git's own progress line is the only thing on screen that moves during a
    # slow clone. Read before the BuildKit patterns because it is unambiguous.
    $objects = [regex]::Matches($text, '(?i)(Receiving|Resolving|Counting|Compressing) objects: +\d+%')
    if ($objects.Count -gt 0) { return $objects[$objects.Count - 1].Value.ToLower() }
    # Extraction is checked first: the download's byte counters stay in the log after
    # the pull has finished, and would otherwise keep winning once it is over.
    if ($text -match '(?i)extracting') { return 'extracting layers' }
    # Docker's own layer counter - "742.8MB / 1.9GB" - is the single most reassuring
    # thing on screen during a first run, because it is the part that visibly moves.
    $sizes = [regex]::Matches($text, '[0-9.]+[KMG]i?B / [0-9.]+[KMG]i?B')
    if ($sizes.Count -gt 0) { return 'pulling ' + $sizes[$sizes.Count - 1].Value }
    $steps = [regex]::Matches($text, '(?m)^#\d+ \[(\d+/\d+)\] ([A-Za-z]+)')
    if ($steps.Count -gt 0) {
        $last = $steps[$steps.Count - 1]
        return 'step ' + $last.Groups[1].Value + ' ' + $last.Groups[2].Value
    }
    return 'working'
}

# Repaint the current check row. The note is truncated so the line cannot wrap: a
# wrapped line defeats the carriage return and leaves a trail of half-finished rows
# up the screen.
function Write-ProgressLine([int]$Seconds, [string]$Note) {
    $room = (Get-ConsoleWidth) - $script:CurrentPrefix.Length - 10
    if ($room -lt 8) { $room = 8 }
    if ($Note.Length -gt $room) { $Note = $Note.Substring(0, $room - 3) + '...' }
    Write-Host ("`r" + $script:CurrentPrefix + $DIM + $Note + " ${Seconds}s" + $RESET) -NoNewline
}

function Clear-ProgressLine {
    Write-Host ("`r" + (' ' * ((Get-ConsoleWidth) - 1)) + "`r") -NoNewline
}

# Start-Process takes ONE argument string rather than an array, so any argument
# containing whitespace has to be quoted here or it is silently split in two. This
# matters: $ComposeFile is built from the repo root, and "C:\Users\Jo Smith\..." is
# an ordinary thing for that to be.
function Format-NativeArgs([string[]]$Arguments) {
    $quoted = foreach ($argument in $Arguments) {
        if ($argument -match '[\s"]') { '"' + ($argument -replace '"', '\"') + '"' } else { $argument }
    }
    return ($quoted -join ' ')
}

# Run a command, send every stream to a log file, return the exit code. Keeping
# this in one place is what keeps the checklist the only thing on screen.
function Invoke-Logged([string]$LogName, [string[]]$Arguments, [string]$Exe = 'docker') {
    $log = Join-Path $LogDir $LogName
    # $ErrorActionPreference MUST be relaxed around a native command.
    #
    # With it set to 'Stop', PowerShell promotes ANY bytes a native command writes to
    # stderr into a terminating NativeCommandError - and docker writes ordinary
    # progress ("Image ... Building") to stderr. So a perfectly healthy build threw
    # a PowerShell stack trace across the checklist, which is precisely the wall of
    # output this script exists to suppress. Judge the command by its EXIT CODE, which
    # is what the callers do.
    if ($script:Progress) { return Invoke-LoggedWithProgress $log $Arguments $Exe }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # 5.1 has no clean way to redirect a native command's streams to a file
        # without a subshell, so call the exe directly and capture every stream.
        & $Exe @Arguments *>&1 | Out-File -LiteralPath $log -Encoding UTF8
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

# The same job as Invoke-Logged, run as a separate process so that this script can
# read the log while docker is still writing it. Start-Process cannot send both
# streams to one file, so they land in two and are merged once it exits.
function Invoke-LoggedWithProgress([string]$Log, [string[]]$Arguments, [string]$Exe = 'docker') {
    $outFile = "$Log.out"
    $errFile = "$Log.err"
    foreach ($stale in @($outFile, $errFile)) {
        if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
    }

    $proc = Start-Process -FilePath $Exe -ArgumentList (Format-NativeArgs $Arguments) `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile

    # Touching .Handle is load-bearing, not a debug leftover. Start-Process -PassThru
    # hands back a Process object that has not cached the process handle, and .ExitCode
    # on such an object comes back EMPTY once the process has gone - so every caller
    # compared '' against 0, and a healthy check reported FAIL. Reading .Handle while
    # the process is still alive caches it, and .ExitCode then works.
    $null = $proc.Handle

    $start = Get-Date
    while (-not $proc.HasExited) {
        Write-ProgressLine ([int]((Get-Date) - $start).TotalSeconds) (Get-ProgressNote @($errFile, $outFile))
        Start-Sleep -Milliseconds 900
    }
    $proc.WaitForExit()
    Clear-ProgressLine

    # stderr first, stdout last. Docker's progress chatter goes to stderr, and check 3
    # reads the TAIL of this log for the version the CLI printed on stdout - so the
    # program's own output has to be the part that comes last.
    $merged = @()
    foreach ($part in @($errFile, $outFile)) {
        if (Test-Path -LiteralPath $part) { $merged += @(Get-Content -LiteralPath $part) }
    }
    $merged | Out-File -LiteralPath $Log -Encoding UTF8
    foreach ($part in @($outFile, $errFile)) {
        if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
    }
    return $proc.ExitCode
}

function Invoke-Compose([string]$LogName, [string[]]$Arguments) {
    $base = @('compose', '-f', $ComposeFile, '-p', $Project)
    return Invoke-Logged $LogName ($base + $Arguments)
}

# Why the current process TOKEN is inspected rather than the group's membership
# list: Windows grants group rights at LOGON. Someone added to docker-users two
# minutes ago is in the group and still cannot reach the Docker pipe, because their
# token predates the change. Checking the group alone would report "you are fine"
# to the one person who most needs telling to sign out and back in.
#
# Returns: 'member' | 'stale-token' | 'not-member' | 'unknown'
# 'unknown' on any failure — a diagnostic must never be the thing that breaks the
# check it is trying to explain.
#
# $GroupName is a parameter purely so this can be exercised against a group the
# caller IS in, one they are NOT in, and one that does not exist — all three
# branches, from a single account. A diagnostic that has only ever been run down
# its happy path is not a diagnostic.
function Get-DockerGroupStatus([string]$GroupName = 'docker-users') {
    try {
        $sid = (New-Object System.Security.Principal.NTAccount($GroupName)).Translate(
            [System.Security.Principal.SecurityIdentifier])
    } catch {
        # No such group: Docker Desktop is not installed the way we expect, so this
        # diagnostic has nothing useful to say. Stay quiet and let the generic
        # message stand.
        return 'unknown'
    }
    try {
        $token = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        foreach ($g in $token.Groups) {
            if ($g.Value -eq $sid.Value) { return 'member' }
        }
    } catch {
        return 'unknown'
    }
    # Not in the token. Distinguish "never added" from "added, not signed in again",
    # because the fix is completely different and one of them needs an administrator.
    try {
        $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $members = Get-LocalGroupMember -Group $GroupName -ErrorAction Stop
        foreach ($m in $members) {
            if ($m.Name -eq $me) { return 'stale-token' }
        }
        return 'not-member'
    } catch {
        # Get-LocalGroupMember can fail on domain-joined machines or for a local
        # account with no rights to read the group. We know the token lacks the SID,
        # which is the part that matters.
        return 'not-member'
    }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
# The screenshots folder must exist BEFORE compose runs: Windows Docker refuses to
# start a container on a missing bind source, where the Linux daemon silently
# creates it. This one line is the difference between a pass and an opaque
# "invalid mount config" for every attendee.
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'screenshots') | Out-Null
Set-Content -LiteralPath $Report -Value '' -Encoding UTF8

# Load .env so the credential checks see the same values the containers will.
#
# Parsed by hand rather than sourced, and $value is CR-stripped, because a .env
# written on Windows is CRLF: a naive read puts a trailing carriage return inside
# the token, which then fails authentication with no visible cause. verify-setup.sh
# sources a CR-stripped copy for the same reason - a CRLF .env must mean the same
# thing on both pathways or the two scripts stop being the same check.
# Stripping the CR here is not the fix and on its own makes things worse: docker
# compose reads the real file and hands the real value to the container, so a
# CR-stripping check passes while Claude still refuses the credential. Recorded and
# reported as a hard failure in check 4. Kept identical to verify-setup.sh.
$script:EnvHasCrlf = $false
$envFile = Join-Path $RepoRoot '.env'
if (Test-Path -LiteralPath $envFile) {
    if ((Get-Content -LiteralPath $envFile -Raw) -match "`r`n") { $script:EnvHasCrlf = $true }
    foreach ($line in (Get-Content -LiteralPath $envFile)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $split = $trimmed.IndexOf('=')
        if ($split -lt 1) { continue }
        $key   = $trimmed.Substring(0, $split).Trim()
        $value = $trimmed.Substring($split + 1).Trim().Trim('"').Trim("'")
        $value = $value -replace "`r", ''
        if ($key -ne '') { Set-Item -Path "Env:$key" -Value $value }
    }
}

# THE port - the one the workshop stack itself publishes, not a stand-in. Kept in
# step with verify-setup.sh and both compose files: one variable governs the check
# and the workshop, so an override set once carries through the whole day.
$Port = if ($env:WORKSHOP_PORT) { $env:WORKSHOP_PORT } else { '5173' }

# ---------------------------------------------------------------------- banner

if (-not $Quiet) {
    Say ''
    Say "${BOLD}${Rule}${RESET}"
    Say "${BOLD}   ORCHLAB WORKSHOP - ENVIRONMENT CHECK (WINDOWS CONTAINERS)${RESET}"
    Say "${BOLD}${Rule}${RESET}"
    Say ''
}

try {

# ------------------------------------------------------------ 1: App cloned
#
# The twin of check 1 in verify-setup.sh, and there for the same reason. The app
# is a SEPARATE repository, cloned into app\ and gitignored here, so that an
# infrastructure change cannot invalidate the cp-* ladder (checkpoints\README.md).
# The one cost of that split is that app\ can simply be absent - and absent does
# not announce itself, because a compose bind-mount of an EMPTY DIRECTORY
# SUCCEEDS. The container starts, reports no error, and has no app inside it.
#
# Cheap, needs no Docker, and the repo is public, so it clones rather than
# printing a command for somebody to copy at 09:05.

Write-CheckStart 'Workshop app cloned'
# The folder is configurable, so every message below names the folder the attendee
# actually has. Split-Path -Leaf, not $AppDir: that is an absolute path, and a
# 60-character path wrapped across a fix-it line is worse than useless.
$appLeaf = Split-Path -Leaf $AppDir
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
$appHasFiles = (Test-Path -LiteralPath $AppDir) -and
    ((Get-ChildItem -LiteralPath $AppDir -Force -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
if (-not $gitCmd) {
    Write-CheckFail 'the git command was not found on your PATH' @'
git is one of the three things this workshop needs on your own machine
                        (the other two are Docker and Claude Code)
                        install it from https://git-scm.com/downloads
                        then re-run  .\verify.ps1
'@
} elseif ($appHasFiles -and -not (Test-Path -LiteralPath (Join-Path $AppDir '.git'))) {
    # Tested by the presence of app.git, NOT by `git -C app rev-parse`.
    # rev-parse WALKS UP the directory tree, so inside an unzipped folder sitting
    # in this repo it finds workshop-example's OWN .git and cheerfully reports
    # success - and the attendee is told their ZIP is a clone of the wrong repo.
    # Deliberately NOT auto-fixed. Creating app\ unasked is safe; deleting a
    # directory somebody already has files in is not, and a downloaded ZIP is the
    # likely cause.
    Write-CheckFail "$appLeaf\ exists but is not a git clone" @"
the checkpoint ladder is git tags, so a copy of the files is not enough
                        move that folder aside:  Rename-Item $appLeaf ${appLeaf}-old
                        then re-run  .\verify.ps1  and it will clone it properly
"@
} else {
    $appAction = 'already cloned'
    if (-not $appHasFiles) {
        # An empty app\ left by an interrupted clone would make git refuse.
        if (Test-Path -LiteralPath $AppDir) {
            Remove-Item -LiteralPath $AppDir -Force -Recurse -ErrorAction SilentlyContinue
        }
        $cloneStart = Get-Date
        # --progress, not --quiet: Get-ProgressNote reads this log to keep the
        # checklist row moving, and without it a slow clone looks like a hang.
        if ((Invoke-Logged '01-clone.log' @('clone', '--progress', $AppRepo, $AppDir) 'git') -eq 0) {
            $appAction = 'cloned in {0}s' -f [int]((Get-Date) - $cloneStart).TotalSeconds
        } else {
            Write-CheckFail "could not clone the workshop app from $AppRepo" @'
this is almost always a network problem - check your connection,
                        then re-run  .\verify.ps1
                        the full git output is in .verify-logs\01-clone.log
'@
        }
    } else {
        # Best effort, and deliberately not fatal: a tag published since this clone
        # was made should be visible, but being offline must not fail a check that
        # has everything it needs on disk. checkpoint.sh retries a fetch of its own.
        $null = Invoke-Logged '01-clone.log' @('-C', $AppDir, 'fetch', '--tags', '--quiet') 'git'
    }

    if (-not $script:Failed) {
        # Prove it is the RIGHT repository, not merely a repository. The workshop
        # stack builds app/autonomous/Dockerfile; missing, it surfaces minutes later
        # as a build error about a missing context.
        if (-not (Test-Path -LiteralPath (Join-Path $AppDir 'autonomous\Dockerfile'))) {
            Write-CheckFail "$appLeaf\ is a git clone, but it is not the workshop app" @"
expected to find $appLeaf\autonomous\Dockerfile and it is not there
                        if you pointed WORKSHOP_APP_REPO somewhere else, unset it
                        otherwise move the folder aside and re-run  .\verify.ps1
"@
        } else {
            $cpTags = @(& git -C $AppDir tag --list 'cp-*' 2>$null)
            if ($cpTags.Count -gt 0) {
                if ($cpTags.Count -eq 1) { $appDetail = '1 checkpoint' } else { $appDetail = '{0} checkpoints' -f $cpTags.Count }
            } else {
                # Not a failure. The ladder is published rung by rung, and
                # checkpoint.sh already reports an unbuilt rung as "not published".
                $appDetail = 'no checkpoints published yet'
            }
            $appName = [System.IO.Path]::GetFileNameWithoutExtension($AppRepo)
            Write-CheckPass "$appName, $appAction, $appDetail"
        }
    }
}

# ------------------------------------------------------------ 2: Docker up

# Guarded like every check after it. Check 1 can now fail, and an unguarded
# check here would run anyway and overwrite the failure being reported.
if (-not $script:Failed) {
    Write-CheckStart 'Docker daemon reachable'
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-CheckFail 'the docker command was not found on your PATH' @'
install Docker Desktop from https://docker.com/products/docker-desktop
                        then re-run  .\verify.ps1
'@
    } elseif ((Invoke-Logged '02-docker.log' @('info')) -ne 0) {
        # `docker info` failing has two very different causes that look identical from
        # here, and guessing wrong is expensive. Without membership of docker-users the
        # daemon is running perfectly and simply will not talk to you — so the old
        # message ("the daemon is not running / start Docker Desktop") sent that person
        # into a restart loop they could never win. Same failure shape as the
        # wrong-container-mode bug: a true symptom attached to the wrong cause.
        switch (Get-DockerGroupStatus) {
            'not-member' {
                Write-CheckFail 'you are not in the docker-users group, so Docker will not talk to you' @'
this needs an administrator, once:
                          Add-LocalGroupMember -Group "docker-users" -Member "<your-username>"
                        run that from an ELEVATED PowerShell, then SIGN OUT and back
                        in - Windows only grants group rights at logon.
                        Docker Desktop itself is almost certainly running fine.
'@
            }
            'stale-token' {
                Write-CheckFail 'you are in the docker-users group, but this logon session predates that' @'
sign out of Windows and sign back in, then re-run  .\verify.ps1

                        Windows grants group rights at logon, so being added to a
                        group does nothing until you start a new session. A reboot
                        works too; restarting Docker Desktop does not.
'@
            }
            default {
                Write-CheckFail 'Docker is installed but the daemon is not answering' @'
start Docker Desktop and wait for the whale icon to stop animating
                        then re-run  .\verify.ps1
                        the full error is in .verify-logs\02-docker.log
'@
            }
        }
    } else {
        # THE check that distinguishes this script from verify-setup.sh. A daemon in
        # Linux-container mode cannot run these Windows images, and the failure would
        # otherwise land three checks later as an unexplained build error.
        $osType = (& docker info --format '{{.OSType}}' 2>$null | Out-String).Trim()
        if ($osType -ne 'windows') {
            Write-CheckFail "Docker is in LINUX-container mode (OSType=$osType), but this is the Windows check" @'
you have two options, and the Linux one is the better-tested path:

                        A) use the Linux stack instead - from the repo root:
                             bash ./verify-setup.sh

                        B) switch Docker Desktop to Windows containers:
                             & "$Env:ProgramFiles\Docker\Docker\DockerCli.exe" -SwitchDaemon
                           then re-run  .\verify.ps1
                           NOTE: this stops any running Linux containers.
'@
        } else {
            $serverVersion = (& docker version --format '{{.Server.Version}}' 2>$null | Out-String).Trim()
            if (-not $serverVersion) { $serverVersion = 'unknown' }
            $build = 0
            try {
                $build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
            } catch { }
            $isolation = if ($env:WINDOWS_ISOLATION) { $env:WINDOWS_ISOLATION } else { 'hyperv' }
            # An ltsc2022 base needs host build 20348+ for PROCESS isolation. Hyper-V
            # isolation gives the container its own kernel and lifts that constraint,
            # which is why it is the default - so this is only fatal for process mode.
            if ($build -gt 0 -and $build -lt 20348 -and $isolation -eq 'process') {
                Write-CheckFail "host build $build is older than 20348, which the ltsc2022 base image needs for process isolation" @'
use Hyper-V isolation instead (it gives the container its own kernel):
                          Remove  WINDOWS_ISOLATION=process  from your environment
                        then re-run  .\verify.ps1
'@
            } else {
                Write-CheckPass "$serverVersion, windows containers, $isolation isolation, host build $build"
            }
        }
    }

}

# --------------------------------------------------------------- 3: Build

if (-not $script:Failed) {
    Write-CheckStart 'Workshop image builds'
    $buildStart = Get-Date
    if ((Invoke-Compose '03-build.log' @('build', 'verify-agent')) -eq 0) {
        Write-CheckPass ("{0}s" -f [int]((Get-Date) - $buildStart).TotalSeconds)
    } else {
        Write-CheckFail 'the container image failed to build' @'
first build pulls a ~2 GB Windows base image and takes a while -
                        check your connection, then re-run  .\verify.ps1
                        full build output is in .verify-logs\03-build.log

                        if it says "no matching manifest for windows",
                        Docker is pulling a Linux-only image - tell a facilitator.
'@
    }
}

# ----------------------------------------------------- 4: Claude Code auth

if (-not $script:Failed) {
    Write-CheckStart 'Claude Code CLI + auth'
    if ($script:EnvHasCrlf) {
        Write-CheckFail '.env has Windows line endings (CRLF)' @'
every value in it ends with an invisible carriage return, including
                        your credential - and a credential with \r on the end is not
                        your credential. Docker passes the broken value straight to
                        the container, so Claude asks you to log in even though
                        everything here looks correct.
                        Fix it by re-saving .env with LF / Unix line endings, or:
                          (Get-Content .env -Raw) -replace "`r`n", "`n" | Set-Content .env -NoNewline
                        then re-run  .\verify.ps1
'@
    } elseif ((-not $env:CLAUDE_CODE_OAUTH_TOKEN) -and (-not $env:ANTHROPIC_API_KEY)) {
        Write-CheckFail 'no credential found - .env has neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY' @'
if you have a Claude SUBSCRIPTION, on your own machine run
                          claude setup-token
                        and paste the sk-ant-oat01- value it prints into .env as
                          CLAUDE_CODE_OAUTH_TOKEN
                        if you have an API KEY from console.anthropic.com, paste it
                        into .env as
                          ANTHROPIC_API_KEY
                        no .env yet?  copy .env.example .env
                        then re-run  .\verify.ps1
'@
    # THE ONE THAT COST AN ATTENDEE AN HOUR. An API key pasted into the OAuth line is
    # non-empty, the right shape and about the right length, and `claude --version`
    # still runs - so this check passed and Claude then asked them to log in, with
    # nothing anywhere pointing at the cause. The prefix is the only tell.
    # Kept identical to check 4 in verify-setup.sh: an attendee on either pathway has
    # to get the same verdict, or the two scripts stop being the same check.
    } elseif ($env:CLAUDE_CODE_OAUTH_TOKEN -and (-not $env:CLAUDE_CODE_OAUTH_TOKEN.StartsWith('sk-ant-oat01-'))) {
        $seen = $env:CLAUDE_CODE_OAUTH_TOKEN.Substring(0, [Math]::Min(13, $env:CLAUDE_CODE_OAUTH_TOKEN.Length))
        Write-CheckFail 'CLAUDE_CODE_OAUTH_TOKEN is not a setup-token value' @"
that line takes a token starting  sk-ant-oat01-
                        what is in it starts  $seen
                        if that is  sk-ant-api03-  it is an API KEY, not a
                        setup-token - move it to ANTHROPIC_API_KEY and leave
                        CLAUDE_CODE_OAUTH_TOKEN empty. Both start sk-ant- and both
                        are about 108 characters; the prefix is the only difference.
                        then re-run  .\verify.ps1
"@
    } elseif ($env:ANTHROPIC_API_KEY -and (-not $env:ANTHROPIC_API_KEY.StartsWith('sk-ant-api03-'))) {
        $seen = $env:ANTHROPIC_API_KEY.Substring(0, [Math]::Min(13, $env:ANTHROPIC_API_KEY.Length))
        Write-CheckFail 'ANTHROPIC_API_KEY is not an API key' @"
that line takes a key starting  sk-ant-api03-
                        what is in it starts  $seen
                        if that is  sk-ant-oat01-  it came from  claude setup-token
                        - move it to CLAUDE_CODE_OAUTH_TOKEN and leave
                        ANTHROPIC_API_KEY empty.
                        then re-run  .\verify.ps1
"@
    } else {
        # `cmd /c` is required, not decoration: npm installs the CLI as claude.cmd
        # and claude.ps1 shims, NOT claude.exe, and a Windows container's exec form
        # only runs real executables. Calling `claude` directly fails with a
        # file-not-found that looks like a broken install.
        $code = Invoke-Compose '04-claude.log' @('run', '--rm', '--no-deps', 'verify-agent', 'cmd', '/c', 'claude --version')
        if ($code -ne 0) {
            Write-CheckFail 'the Claude Code CLI did not start inside the container' @'
check .verify-logs\04-claude.log for the error
                        if it mentions authentication, re-run  claude setup-token
                        and refresh the value in .env
'@
        # One real round trip. Everything above proves the value is present, the right
        # shape, and that the CLI runs - and `claude --version` makes no network call,
        # so all of it passed for an attendee whose credential was rejected the moment
        # they used it. Kept in step with check 4 of verify-setup.sh.
        } elseif ((Invoke-Compose '04-auth.log' @('run', '--rm', '--no-deps', 'verify-agent', 'cmd', '/c', 'claude -p "Reply with the two characters: OK"')) -ne 0) {
            Write-CheckFail 'the credential was rejected - Claude could not authenticate' @'
the value in .env is present and the right shape, but Claude will not
                        accept it. The usual causes, in order:
                          - the token has expired or been revoked; run
                            claude setup-token  again on your own machine
                          - it was truncated on the way into .env - check there is no
                            line break or stray quote around it
                          - .env was saved with Windows line endings (see above)
                        the exact error is in .verify-logs\04-auth.log
'@
        } else {
            $claudeVersion = ''
            $logPath = Join-Path $LogDir '04-claude.log'
            if (Test-Path -LiteralPath $logPath) {
                $match = Get-Content -LiteralPath $logPath |
                         Where-Object { $_ -match '\d+\.\d+\.\d+' } |
                         Select-Object -Last 1
                if ($match) { $claudeVersion = ($match -replace '\s.*$', '').Trim() }
            }
            if (-not $claudeVersion) { $claudeVersion = 'ok' }
            # Honest wording: this proves the CLI RUNS and a credential is PRESENT.
            # It does not call the API, so it cannot prove the credential is valid.
            Write-CheckPass "claude $claudeVersion, credential authenticated (not validated)"
        }
    }
}

# ------------------------------------------------------- 5: Site reachable

if (-not $script:Failed) {
    Write-CheckStart 'Workshop site responds'
    if ((Invoke-Compose '05-web.log' @('up', '-d', 'verify-web')) -ne 0) {
        Write-CheckFail "port $Port is already in use - this is the port the workshop needs" @"
if the workshop stack is already running, that is what is holding it:
                          docker compose -f docker-compose.workshop.yml down
                        otherwise something else has it - another Vite project is
                        the usual answer, since 5173 is its default.
                        Pick a different port, and KEEP it for the workshop:
                          `$env:WORKSHOP_PORT=5174; .\verify.ps1
"@
    } else {
        $siteStart = Get-Date
        $siteOk = $false
        # Poll rather than sleep-and-hope, so a slow machine passes and a genuinely
        # broken one fails fast enough to keep the room moving. Windows containers
        # start slower than Linux ones, hence 60 tries rather than 30.
        for ($i = 1; $i -le 60; $i++) {
            try {
                Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3 | Out-Null
                $siteOk = $true
                break
            } catch {
                if ($script:Progress) {
                    Write-ProgressLine ([int]((Get-Date) - $siteStart).TotalSeconds) `
                        "waiting for the site to answer on :$Port"
                }
                Start-Sleep -Seconds 1
            }
        }
        if ($script:Progress) { Clear-ProgressLine }
        if ($siteOk) {
            Write-CheckPass ("HTTP 200 on :{0}, {1}s" -f $Port, [int]((Get-Date) - $siteStart).TotalSeconds)
        } else {
            Write-CheckFail "nothing answered on http://localhost:$Port/ after 60s" @"
something may be holding port $Port without Docker noticing.
                        Pick a different port, and KEEP it for the workshop:
                          `$env:WORKSHOP_PORT=5174; .\verify.ps1
                        container output is in .verify-logs\05-web.log
"@
        }
    }
}

# ---------------------------------------------------------- 6: Screenshot

if (-not $script:Failed) {
    Write-CheckStart 'Playwright screenshot captured'
    if (Test-Path -LiteralPath $Screenshot) { Remove-Item -LiteralPath $Screenshot -Force }
    $code = Invoke-Compose '06-screenshot.log' @('run', '--rm', 'verify-agent', 'node', 'C:/app/screenshot.mjs')
    if ($code -ne 0) {
        Write-CheckFail 'the headless browser could not render and capture the page' @'
check .verify-logs\06-screenshot.log for the error
                        then re-run  .\verify.ps1
'@
    } elseif (-not (Test-Path -LiteralPath $Screenshot) -or (Get-Item -LiteralPath $Screenshot).Length -eq 0) {
        Write-CheckFail "Playwright reported success but $ShotRelative was not written" @'
this is usually a Docker file-sharing permission problem
                        check that this folder is shared with Docker Desktop
                        (Settings > Resources > File Sharing)
'@
    } else {
        $sizeKb = [int]((Get-Item -LiteralPath $Screenshot).Length / 1024)
        $engine = if ($env:PW_BROWSER) { $env:PW_BROWSER } else { 'firefox' }
        # What the browser stamped onto the image. Read back out of the log because
        # the container that knew it is already gone - see the verdict block.
        $shotLog = Join-Path $LogDir '06-screenshot.log'
        if (Test-Path -LiteralPath $shotLog) {
            $lines = Get-Content -LiteralPath $shotLog
            $h = $lines | Where-Object { $_ -match '^VERIFY_HOST=' } | Select-Object -Last 1
            $t = $lines | Where-Object { $_ -match '^VERIFY_STAMP=' } | Select-Object -Last 1
            if ($h) { $script:ShotHost  = ($h -replace '^VERIFY_HOST=', '').Trim() }
            if ($t) { $script:ShotStamp = ($t -replace '^VERIFY_STAMP=', '').Trim() }
        }
        Write-CheckPass "verify.png, $sizeKb KB, $engine"
    }
}

# ------------------------------------------------------------ Skipped rows

# A failure stops the run, but the checklist should still show its full length -
# otherwise it reads as "the script crashed" rather than "check 3 failed".
$remaining = @{ 2 = 'Docker daemon reachable'; 3 = 'Workshop image builds'; 4 = 'Claude Code CLI + auth';
                5 = 'Workshop site responds'; 6 = 'Playwright screenshot captured' }
while ($script:Idx -lt $Total) {
    Write-CheckStart $remaining[$script:Idx + 1]
    Say "$($script:CurrentLine)${DIM}----${RESET}   ${DIM}not reached${RESET}"
}

# ---------------------------------------------------------------- Verdict

Say ''
if (-not $script:Failed) {
    Say "   ${GREEN}${BOLD}ALL $Total CHECKS PASSED${RESET}"
    Say ''
    Say "   Your environment is ready. ${BOLD}There is nothing else to do.${RESET}"
    Say "   Open ${BOLD}$ShotRelative${RESET} to see the proof - it should read"
    Say '   "ENVIRONMENT OK" and match this:'
    Say ''
    # The container is destroyed as soon as the check finishes, so its hostname
    # cannot be looked up afterwards. Printing it here is what turns "it should show
    # your container name" into something an attendee can actually perform.
    $hostText  = if ($script:ShotHost)  { $script:ShotHost }  else { '(not reported)' }
    $stampText = if ($script:ShotStamp) { $script:ShotStamp } else { '(not reported)' }
    Say "       Container:  ${BOLD}$hostText${RESET}"
    Say "       Taken at:   ${BOLD}$stampText${RESET}"
    Say ''
    Say "   ${BOLD}${Rule}${RESET}"
    if ($Quiet) { Write-Host "PASS  all $Total checks (windows containers)" }
    $script:ExitCode = 0
} else {
    Say "   ${RED}${BOLD}1 CHECK FAILED${RESET} - this is fixable, and you are not behind."
    Say ''
    Say "       Failed check:    ${BOLD}$($script:FailLabel)${RESET}"
    Say "       What went wrong: $($script:FailCause)"
    Say "       Fix it:          $($script:FailFix)"
    Say '       Still stuck?     raise your hand - do not keep retrying.'
    Say ''
    Say "   A copy of this report is in ${BOLD}verify-report.txt${RESET} - paste it if you ask for help."
    Say "   ${BOLD}${Rule}${RESET}"
    if ($Quiet) { Write-Host "FAIL  $($script:FailLabel) (windows containers)" }
    $script:ExitCode = 1
}

} catch {
    # An unexpected error must still read as a failed CHECK, not as a crash. A
    # PowerShell stack trace across the checklist makes a fixable problem look like
    # broken tooling, and is the exact failure mode this script exists to prevent.
    Say ''
    Say "   ${RED}${BOLD}THE CHECK ITSELF HIT AN UNEXPECTED ERROR${RESET}"
    Say ''
    Say "       $($_.Exception.Message)"
    Say ''
    Say '       This is a bug in verify.ps1, not a problem with your machine.'
    Say '       Please show this to a facilitator.'
    Say ''
    Say "   ${BOLD}${Rule}${RESET}"
    if ($Quiet) { Write-Host 'FAIL  verify.ps1 itself errored' }
    $script:ExitCode = 3
} finally {
    # Teardown runs even on Ctrl-C or an unexpected error, so a half-finished run
    # never leaves a container holding port 8080 and breaking the next attempt.
    if (-not $Keep) {
        Invoke-Compose 'teardown.log' @('down', '--remove-orphans') | Out-Null
    }
}

exit $script:ExitCode
