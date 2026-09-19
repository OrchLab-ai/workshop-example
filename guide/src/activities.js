// The workshop's activities, as data. build-guide.js turns this into the HTML
// guide; keeping it in one place means the checkpoint numbers cannot drift
// between pages the way they would across ten hand-written files.
//
// `intent` is the first-person phrasing used on the index cards — attendees
// navigate by what they are trying to achieve, not by activity number.
// `cheat` is the shortcut, rendered collapsed so nobody is nudged into it.
//
// The audience is on laptops, not phones. Anything they would otherwise have to
// retype off a slide belongs in `commands`, `prompts`, or `links` here — those
// render as one-click copy blocks, and the deck points at this guide instead of
// showing a QR code.

const REPO_URL = "https://github.com/OrchLab-ai/workshop-example";

// Links worth having in one place — rendered on the index and on links.html.
//
// No support channel belongs in here. Somebody stuck on setup is routed to the
// workshop team directly (see HELP below), not to a room where they have to wait
// and chase — so this list stays what it says it is: reference material.
const LINKS = [
  { label: "The workshop container (this repo)", url: REPO_URL },
  { label: "Starting point — cp-00", url: `${REPO_URL}/tree/cp-00` },
  { label: "Workshop deck", url: "https://orchlab.ai/workshop-deck" },
  { label: "Playwright in Docker — reference implementation", url: "https://github.com/OrchLab-ai/playwright-in-docker" },
  { label: "The bug AI found in seconds (HdrHistogram PR)", url: "https://github.com/HdrHistogram/HdrHistogram.NET/pull/130/" },
];

// The setup pathways, as data.
//
// WHY THIS EXISTS: "Windows" is not one answer. Docker Desktop on Windows runs
// EITHER Linux containers (the common case, WSL2 backend) OR Windows containers —
// one daemon, one mode, never both — and the workshop's check is a different script
// in each case. An attendee in Windows-container mode who runs ./verify-setup.sh gets a
// build failure that reads "this is almost always a network problem", which sends
// them off debugging their wifi. So the guide asks the question up front and has
// them RUN a command to answer it rather than guess.
//
// macOS is deliberately a single pathway: Docker Desktop there has no
// Windows-container mode at all, so there is nothing to determine.
const DETECT_COMMAND = "docker info --format '{{.OSType}}'";

// Both Windows pathways share this: docker-users gates access to Docker Desktop
// regardless of which container mode it is in. Defined once so the two pathways
// cannot drift apart.
const DOCKER_USERS_NOTE =
  'If Docker says <strong>access is denied</strong>, or the check reports you are not in <code>docker-users</code>: an administrator needs to run <code>Add-LocalGroupMember -Group docker-users -Member &lt;your-username&gt;</code> once — and then you must <strong>sign out of Windows and back in</strong>. Group rights are granted at logon, so nothing changes until a new session. Restarting Docker Desktop will not help.';

// Where to run things, and what the token step actually involves. Both questions
// come up on every pathway, so the text lives here once rather than three times.
const CWD_CLONE =
  "Start from wherever you keep your code — the first command creates the <code>workshop-example</code> folder, and every command after it runs from <strong>inside</strong> that folder.";

// "Have you already done this?" — asked because this one page serves two people who
// need almost nothing in common.
//
// Setup is done BEFORE the workshop; the environment check is re-run ON the day, and
// on the day the first three steps are noise: the repo is cloned, .env is filled in,
// and all anyone wants is the one command that proves it still works. Rendering the
// whole setup for them made the actual instruction the fourth thing on the page.
//
// Two states, remembered like the platform, and reversible from the bar it leaves
// behind - somebody who answers "yes" and then finds app/ missing needs one click to
// get the full guide back.
const SETUP_STATES = {
  question: "Have you set this machine up already?",
  detail:
    "Setup is a one-off you do before the workshop. The check itself you can run as often as you like — including on the morning, to prove nothing has drifted.",
  options: [
    {
      id: "done",
      label: "Yes — just run the check",
      sub: "Repo cloned, <code>.env</code> filled in",
    },
    {
      id: "fresh",
      label: "No — start from the beginning",
      sub: "Clone, <code>.env</code>, credential, then check",
    },
  ],
  labels: { done: "Running the check only", fresh: "Full setup" },
};

// The credential, as two exclusive sections rather than a list of options.
//
// WHY EXCLUSIVE. Presented as prose with an "or", this produced the single most
// expensive failure of the setup: an API key pasted into the OAuth line. The two
// values are near-identical - both sk-ant-, both about 108 characters - so the only
// thing that prevents the mistake is never showing the reader the line that is not
// theirs. Opening one closes the other, so at most one set of instructions is on
// screen at a time and there is nothing to accidentally follow.
//
// `open: true` on the subscription section: it is what most of the room has, and an
// accordion with nothing open reads as a page that has not loaded.
//
// Adding a provider later (Cursor CLI, Codex) means adding an entry HERE - a third
// exclusive section with its own command - not another line of prose about
// alternatives.
const CREDENTIALS = {
  intro:
    "You need <strong>one</strong> credential in <code>.env</code>. Open whichever of these describes you — and ignore the other one completely.",
  options: [
    {
      id: "subscription",
      open: true,
      summary: "I have a Claude subscription",
      hint: "Most people. Pro, Max or Team.",
      body:
        "Run this on <strong>your own machine</strong>, never inside the container. It needs Claude Code installed locally — <code>npm install -g @anthropic-ai/claude-code</code> — and it opens a browser for you to sign in. It then prints a long-lived token.",
      command: { label: "On your own machine", code: "claude setup-token", where: "host" },
      after:
        "The value it prints starts <code>sk-ant-oat01-</code>. Paste it into <code>.env</code> after <code>CLAUDE_CODE_OAUTH_TOKEN=</code> and leave <code>ANTHROPIC_API_KEY</code> commented out.",
    },
    {
      id: "apikey",
      summary: "I have an Anthropic API key",
      hint: "From console.anthropic.com. Billed per token.",
      body:
        'Create one at <a href="https://console.anthropic.com">console.anthropic.com</a> if you do not have it yet. There is nothing to install and nothing to run.',
      after:
        "The key starts <code>sk-ant-api03-</code>. Uncomment <code>ANTHROPIC_API_KEY</code> in <code>.env</code>, paste it there, and leave <code>CLAUDE_CODE_OAUTH_TOKEN</code> empty.",
    },
  ],
  // Shown under both, because it is the thing neither section can tell you on its
  // own: that the other one exists and looks the same.
  warning:
    "<strong>The two are not interchangeable and they look almost identical</strong> — both start <code>sk-ant-</code>, both run to about 108 characters. Only the prefix tells them apart, and putting one on the other's line fails <em>silently</em>: <code>.env</code> looks right, all six checks pass, and Claude asks you to log in anyway. Check 4 tests the prefix so that it fails loudly instead. Either value is a credential: <code>.env</code> is gitignored, and it must never be pasted into a message or a screenshot.",
};

const PLATFORMS = [
  {
    id: "macos",
    os: "macos",
    label: "macOS",
    // Shown on the pathway panel so someone can sanity-check they picked right.
    confirm: "Docker Desktop on macOS only runs Linux containers — there is nothing to determine.",
    shell: "Terminal",
    cwd: CWD_CLONE,
    commands: [
      { label: "Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "Create your .env", code: "cp .env.example .env" },
      ],
    checkCommands: [
      { label: "Run the check", code: "./verify-setup.sh" },
      { label: "Only if the check says 5173 is taken", code: "echo WORKSHOP_PORT=5174 >> .env\n./verify-setup.sh" },
    ],
  },
  {
    id: "windows-linux",
    os: "windows",
    label: "Linux containers",
    detectValue: "linux",
    confirm:
      "This is the usual setup on Windows, and the better-tested path.",
    shellNote:
      'which comes with Git for Windows. <span class="not">Not PowerShell, and not CMD</span> — ' +
      'the commands below are POSIX shell and will not run there.',
    shell: "Git Bash",
    cwd: CWD_CLONE,
    notes: [DOCKER_USERS_NOTE],
    commands: [
      { label: "Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "Create your .env", code: "cp .env.example .env" },
      ],
    checkCommands: [
      { label: "Run the check", code: "./verify-setup.sh" },
      { label: "Only if the check says 5173 is taken", code: "echo WORKSHOP_PORT=5174 >> .env\n./verify-setup.sh" },
    ],
  },
  {
    id: "windows-windows",
    os: "windows",
    label: "Windows containers",
    detectValue: "windows",
    confirm:
      "Less common, and usually deliberate — .NET Framework work needs it. You do <strong>not</strong> have to switch modes: there is a Windows-container check that proves the same six things.",
    shell: "PowerShell",
    cwd: CWD_CLONE,
    commands: [
      { label: "Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "Create your .env", code: "copy .env.example .env" },
      ],
    checkCommands: [
      { label: "Run the check", code: "powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
      { label: "Only if the check says 5173 is taken", code: "$env:WORKSHOP_PORT=5174\npowershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
    ],
    notes: [
      "The first run pulls a ~2 GB Windows base image, so give it longer than you would expect. Later runs reuse it.",
      DOCKER_USERS_NOTE,
      'If <strong>Switch to Windows containers</strong> appears to do nothing, the <code>Containers</code> optional feature is off. It is separate from Hyper-V. Enable it from an elevated PowerShell and <strong>reboot</strong>: <code>Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart</code>',
    ],
  },
];

// A sentence that is only true on Windows, inside prose that is shared. The
// block-level `only:` field gates whole troubleshooting entries; this gates a clause.
// Same data-only contract, so the one script hides both and nothing new is needed:
// with no pathway chosen it stays visible, which is the right default for somebody
// reading the troubleshooting list before they have answered the picker.
const winOnly = t => `<span data-only="windows-linux windows-windows">${t}</span>`;
// Narrower still: true on the Git Bash pathway and NOT on the PowerShell one, which
// is a distinction it is very easy to lose when both are "Windows".
const gitBashOnly = t => `<span data-only="windows-linux">${t}</span>`;

// What actually goes wrong, and what to do about it.
//
// WHY THIS EXISTS: the check already prints a cause and a fix when it fails, but
// the person reading it is on their own, usually the night before, and the failure
// they hit is the one thing they cannot search this guide for. So every failure the
// script can report is written down here in one place, ahead of time.
//
// SOURCE OF TRUTH: the `fail_check` calls in verify-setup.sh. Each entry below
// quotes the cause line the script prints verbatim, so an attendee can match what
// is on their screen to an entry here without interpreting anything. If a fix
// changes in the script, change it here in the same commit — a fix that disagrees
// with the one on screen is worse than no fix at all.
//
// `only` narrows an entry — or a single command inside one — to the pathways it
// actually applies to, using the same ids as PLATFORMS. Omit it and the entry shows
// on every pathway, which is the right default: most of these failures have nothing
// to do with the operating system. Use it for the ones that genuinely do, and for
// commands that are a different language in a different shell.
//
// Nothing is hidden until a pathway is chosen. Somebody who scrolls straight to the
// troubleshooting section without answering the picker sees everything — showing a
// Windows reader one macOS line costs far less than showing a stuck reader nothing.
const TROUBLESHOOTING = [
  {
    check: "Before check 1",
    only: ["windows-linux", "windows-windows"],
    symptom: "Docker is in Windows-container mode — run windows\\verify.ps1 instead",
    fix:
      "Not a failure, and nothing is broken. Every image <code>./verify-setup.sh</code> uses is a " +
      "Linux image, and one Docker daemon serves one mode. You do <strong>not</strong> need to " +
      "switch modes — there is a Windows-container check that proves the same six things.",
    commands: [
      { label: "Run this instead", code: "powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
    ],
  },
  {
    check: "Check 1",
    symptom: "the 'git' command was not found on your PATH",
    fix:
      "git is one of the three things this workshop needs on your own machine — the other two are " +
      "Docker and Claude Code. Install it from <a href=\"https://git-scm.com/downloads\">git-scm.com/downloads</a>, " +
      "then re-run the check. " +
      gitBashOnly(
        "Installing Git for Windows is also what gives you <strong>Git Bash</strong>, which is the " +
          "shell the whole setup expects."
      ),
  },
  {
    check: "Check 1",
    symptom: "app/ exists but is not a git clone",
    fix:
      "You almost certainly downloaded the app as a ZIP rather than cloning it. A copy of the files " +
      "is not enough: the checkpoint ladder <em>is</em> the git tags, so <code>./checkpoint.sh</code> " +
      "has nothing to move you between. The check will not delete that folder for you — you may have " +
      "put work in it — so move it aside yourself and let the check clone it properly.",
    // Both halves of this are shell-specific: mv/move, and which check to re-run.
    // Ungated, it handed a PowerShell attendee two commands neither of which works.
    commands: [
      {
        label: "Move it aside, then re-run",
        code: "mv app app-old\n./verify-setup.sh",
        only: ["macos", "windows-linux"],
      },
      {
        label: "Move it aside, then re-run",
        code: "move app app-old\npowershell -ExecutionPolicy Bypass -File windows\\verify.ps1",
        only: ["windows-windows"],
      },
    ],
  },
  {
    check: "Check 1",
    symptom: "could not clone the workshop app",
    fix:
      "Almost always the network — a VPN or a corporate proxy is the usual culprit, and the " +
      "repository itself is public. Check your connection and re-run. The full git output is in " +
      "<code>.verify-logs/01-clone.log</code>, and it names the real cause when it is not the network.",
  },
  {
    check: "Check 2",
    symptom: "Docker is installed but the daemon is not answering",
    fix:
      "Start Docker Desktop and wait for the whale icon to <strong>stop animating</strong> before you " +
      "re-run — a daemon that is still starting looks exactly like one that is down. If you have " +
      "restarted it twice and nothing changes, read the next entry: a permissions problem looks " +
      "identical from here, and no amount of restarting will fix it.",
  },
  {
    check: "Check 2",
    // Not macOS: Docker Desktop there has no group gating this, which is why the
    // prerequisites table in the README lists nothing against it.
    only: ["windows-linux", "windows-windows"],
    symptom: "you do not have permission to reach Docker / the Docker socket",
    fix:
      "<strong>The daemon is running fine.</strong> It simply will not talk to you, and restarting it " +
      "cannot change that — this is the one failure that sends people into a loop they can never win. " +
      "It needs an administrator once, and then a <strong>new login session</strong>: group rights are " +
      "granted at logon, so nothing changes until you sign out and back in.",
    commands: [
      { label: "In an ELEVATED PowerShell, then sign out of Windows and back in", code: "Add-LocalGroupMember -Group docker-users -Member <your-username>" },
      // Shown only to somebody who has not picked a pathway, which is where a Linux
      // host lands: the picker offers macOS and Windows, and Linux is neither.
      { label: "On a Linux host instead — then log out and back in", code: "sudo usermod -aG docker $USER", only: [] },
    ],
  },
  {
    check: "Check 3",
    symptom: "it has been sitting on check 3 for several minutes",
    fix:
      "<strong>Nothing is wrong, and this is the check earning its keep.</strong> The first run " +
      "downloads the Playwright base image — roughly 2&nbsp;GB — then builds three images on it: the " +
      "check's own, the workshop container you spend the day inside, and the Part 3 agent. Every byte " +
      "it fetches now is a byte the workshop would otherwise fetch on the day, while a room waits. The " +
      "row tells you what Docker is doing and how long it has been at it " +
      "(<code>pulling 742.8MB / 1.9GB 96s</code>). Later runs reuse it all and check 3 takes seconds. " +
      "This is the reason to run the check the night before rather than at 09:05.",
  },
  {
    check: "Check 3",
    symptom: "the container image failed to build",
    fix:
      "Almost always the network, for the same reason as above — the build has to pull that base image. " +
      "Check your connection and re-run; the full build output is in <code>.verify-logs/03-build.log</code>. " +
      winOnly(
        "If that log mentions Windows containers rather than a download, you are in the wrong " +
          "container mode — see the first entry on this list."
      ),
  },
  {
    check: "Check 4",
    symptom: "no credential found — .env has neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY",
    fix:
      "The most common failure of the six, and it is usually one of two things: <code>.env</code> was " +
      "never created from <code>.env.example</code>, or the credential was pasted into the example file " +
      "instead of into <code>.env</code>. Then open <em>Your credential</em> above and follow whichever " +
      "of the two sections describes you — one of them, not both.",
    commands: [
      { label: "Create .env if you have not already", code: "cp .env.example .env", only: ["macos", "windows-linux"] },
      { label: "Create .env if you have not already", code: "copy .env.example .env", only: ["windows-windows"] },
    ],
  },
  {
    check: "Check 4",
    symptom: "CLAUDE_CODE_OAUTH_TOKEN is not a setup-token value / ANTHROPIC_API_KEY is not an API key",
    fix:
      "<strong>The credential is on the wrong line.</strong> The two values are near-identical — both " +
      "start <code>sk-ant-</code>, both around 108 characters — so this is easy to do and impossible to " +
      "spot. Only the prefix tells them apart: <code>sk-ant-oat01-</code> comes from " +
      "<code>claude setup-token</code> and belongs on <code>CLAUDE_CODE_OAUTH_TOKEN</code>; " +
      "<code>sk-ant-api03-</code> is an API key from the Anthropic console and belongs on " +
      "<code>ANTHROPIC_API_KEY</code>. Move it to the other line, leave the one you vacated empty, and " +
      "re-run the check. <strong>This check exists because the failure is otherwise silent:</strong> " +
      "without it the value is accepted, all six checks pass, and Claude asks you to log in later with " +
      "nothing pointing at the cause.",
  },
  {
    check: "Check 4",
    symptom: "the Claude Code CLI did not start inside the container",
    fix:
      "The credential is present but the container could not use it. Read " +
      "<code>.verify-logs/04-claude.log</code>: if it mentions authentication, the token has expired or " +
      "was truncated on the way into <code>.env</code> — re-run <code>claude setup-token</code> and " +
      "replace the value. Check there is no stray quote or line break around it.",
  },
  {
    check: "Check 5",
    symptom: "port 5173 is already in use — this is the port the workshop needs",
    fix:
      "Check 5 deliberately claims <strong>the port the workshop itself runs on</strong>, not a spare " +
      "one, so a pass means the day will work rather than merely that some port was free. 5173 is " +
      "Vite's default, so the usual culprit is another project of yours already running. If you have " +
      "the workshop stack up from earlier, that is what is holding it: " +
      "<code>docker compose -f docker-compose.workshop.yml down</code>. Otherwise move the workshop to " +
      "another port — put it in <code>.env</code> and it is picked up by the check <em>and</em> the " +
      "stack, so every other command in this guide stays exactly as written.",
    commands: [
      { label: "Move the workshop to another port, once", code: "echo WORKSHOP_PORT=5174 >> .env\n./verify-setup.sh", only: ["macos", "windows-linux"] },
      { label: "Move the workshop to another port, once", code: "$env:WORKSHOP_PORT=5174\npowershell -ExecutionPolicy Bypass -File windows\\verify.ps1", only: ["windows-windows"] },
    ],
  },
  {
    check: "Check 6",
    symptom: "Playwright reported success but screenshots/verify.png was not written",
    fix:
      "The browser rendered the page; the container then could not write the file back out to your " +
      "machine. That is a Docker file-sharing permission, not a browser problem. In Docker Desktop, " +
      "check this folder is shared: <strong>Settings &rarr; Resources &rarr; File Sharing</strong>.",
  },
  {
    check: "Check 6",
    symptom: "the headless browser could not render and capture the page",
    fix:
      "Read <code>.verify-logs/06-screenshot.log</code> and re-run. This one is rare, and on a machine " +
      "where checks 1–5 passed it is usually transient — the site had not finished starting. If it " +
      "fails twice with the same error, that is the point to ask rather than keep re-running.",
  },
];

// When to stop debugging and ask. Deliberately specific about WHEN, because the
// failure mode we actually see is somebody quietly re-running the check for forty
// minutes rather than spending thirty seconds asking.
//
// ASK US, not a channel. There is deliberately no community link in this section: a
// setup failure before the day is ours to fix, and pointing somebody at a chat room
// turns it into their job to chase an answer. Everything here routes to a human on
// the workshop team.
const HELP = {
  steps: [
    "<strong>Read the FAIL block first.</strong> The check stops at the first failure and prints the cause and the fix. It is not a stack trace — it is written to be acted on.",
    "<strong>Re-run once.</strong> A daemon that was still starting, or a download that dropped, passes on the second run. Once.",
    "<strong>Same failure twice? Stop.</strong> Re-running a third time will not change the answer, and this is the moment people lose an evening. Everything needed to diagnose it is already on disk.",
    "<strong>Ask us, with the report attached.</strong> Come straight to the workshop team — reply to whoever sent you this guide, and send <code>verify-report.txt</code> with it. That file is written next to the script on every run and says exactly which check failed and why, so attaching it is the difference between an answer in minutes and a conversation over several messages.",
  ],
  note:
    "<strong>Never send us your <code>.env</code>, your token, or your API key</strong> — not in a message, not in a screenshot, not to a facilitator, and we will never ask for them. <code>verify-report.txt</code> is written to be safe to share: it reports whether a credential was <em>found</em>, never what it is. If you have already pasted a token somewhere, run <code>claude setup-token</code> again to replace it.",
  onTheDay:
    "<strong>On the day itself, just raise your hand.</strong> One of us will come to you — that is what we are there for, and it is always faster than working at it alone. Do not spend the first exercise fixing your setup — the workshop is built so that falling behind never locks you out: <code>./checkpoint.sh</code> puts you exactly where the room is, and nothing you have written is discarded when it does.",
  logsNote:
    "Detailed output from every step is kept in <code>.verify-logs/</code>, one file per check. You should not need it — the FAIL block names the cause — but when a fix below says \"read the log\", that is where it is.",
};

// Where things run, stated once.
//
// Two places, and only two. Host commands are git and docker — the things that move
// you between checkpoints and start the stack. Everything else happens inside the
// container, including Claude Code itself: that is the isolation the deck argues for
// on its "Levels of Safety" slide, and it is what makes skipping permission prompts
// in Part 3 a contained risk rather than a reckless one.
//
// Each command block carries its own badge, because by the third command nobody
// remembers a heading.
const FIRST_RUN_NOTE =
  "<strong>The first start of the day takes a few minutes, and only the first.</strong> The container installs the app's dependencies before it can serve anything. <code>./workshop/up.sh</code> is the reason step 1 is not a plain <code>docker compose up -d</code>: compose would report the <em>container</em> started — true within seconds — and hand you back a prompt while the app was still minutes away, so opening the URL then looks broken when it is merely early. The script waits, prints each phase as it happens, and tells you <strong>READY</strong> when the site actually answers. If it fails it says so, and names the log to read.";

// The one line above an activity page's commands.
//
// NO `shell` KEY, on purpose. This used to open "Run these in two places - your
// machine, and the container", which described the day's setup rather than the page's
// commands, and stopped being true the moment the terminal-opening commands left
// these pages: activity 02 now has exactly one command, in one window. By the time
// anybody reads an activity page the three windows are open and every block is badged
// with the one it belongs in, so this only has to say what a badge means.
const WHERE = {
  // {shell} is replaced with the terminal application for the chosen pathway, from
  // PLATFORMS. It used to read "Git Bash (Windows) or Terminal (macOS)", which names
  // both and is therefore wrong for whoever is reading it - the leak that the
  // platform-visibility test now catches.
  cwd:
    'Each block is badged with the window it belongs in, and the host terminal is ' +
    '{shell} in your <code>workshop-example</code> folder. Not set up yet? ' +
    '<a href="start-your-day.html">Start your day</a>.',
}

// The morning start: three windows, and the command that opens each one. It renders
// on start-your-day.html and NOWHERE ELSE.
//
// COMMANDS LIVE INSIDE THE STEPS. They used to be a separate numbered list below this
// block, which meant reading the three terminals, scrolling past them, and then
// matching "2. Get a shell inside the container" back onto "terminal 2" by name. Two
// numbered lists describing the same three things, and the mapping left to the
// reader. One list now, and each window carries the command that opens it.
//
// It also used to be spliced into every activity's commands, on the reasoning that
// people arrive at the guide mid-morning having closed their terminal. That reasoning
// was wrong twice over: it is done once a day, by a room that has just been walked
// through it on the slides, and repeated above ten activities the block was longer
// than the activity underneath it. Every page links here from its header.
//
// `shell` in each body is rendered per-pathway from PLATFORMS, so the window an
// attendee is told to open is the same one their setup pathway told them to use.
const TERMINALS = {
  intro:
    "Open <strong>three terminal windows</strong> before you start and keep all three open all day. Almost every confusion about where a command goes is really a confusion about which of these you are in.",
  list: [
    {
      n: "1",
      where: "host",
      title: "The host terminal",
      body:
        "A {shell} window in your <code>workshop-example</code> folder — the only one of the three that is <em>not</em> inside the container. Only two kinds of command run here: <code>docker</code> and <code>./checkpoint.sh</code>. Nothing you type here touches the app.",
      commands: [
        {
          // Not a bare `docker compose up -d`. That reports the CONTAINER started -
          // true within seconds - and returns, while the app inside is still minutes
          // from answering. This waits, narrates what it is waiting for, and says
          // READY when the site genuinely responds. Raw compose still works; it just
          // tells you less.
          //
          // ONE command, not one per pathway. A PowerShell variant was drafted here
          // and removed: the windows-windows pathway cannot run this stack at all
          // (the images are Linux), so offering it a command that "works" would
          // contradict the note below, which tells that pathway to switch Docker to
          // Linux containers. Two of the three pathways share this exactly, and the
          // third is not a shell problem.
          label: "Start the stack, and wait until the app is really up",
          code: "./workshop/up.sh",
          where: "host",
        },
      ],
    },
    {
      n: "2",
      where: "container",
      title: "The work terminal",
      body:
        "Open a second {shell} window and run this. You are then <em>inside</em> the container: this is where you run tests, <code>./scripts/ci-check.sh</code>, git commands against the app, and anything else that needs to see the code. Everything badged <em>work terminal</em> goes here.",
      commands: [
        {
          label: "Get a shell inside the container",
          code: "docker compose -f docker-compose.workshop.yml exec claude-container bash",
          where: "host",
        },
      ],
    },
    {
      n: "3",
      where: "claude",
      title: "The Claude terminal",
      body:
        "Open a third {shell} window and run this — it drops you straight into Claude, inside the container. Also a container shell, but it gets its own badge and its own window for one reason: <strong>keep it separate.</strong> Claude holds its conversation in that session — exiting it to run one command throws the context away, and that context is most of what you are paying for.",
      commands: [
        {
          // ONE command, not `exec ... bash` followed by `claude` on a second line.
          // Those two lines copy as one paste, and the paste does not survive: the
          // first line starts an interactive bash that takes over stdin, and `claude`
          // is consumed by whatever is reading it at that instant rather than run in
          // the new shell. `claude` is a global npm binary in the image, so exec can
          // launch it directly and there is no second line to lose.
          //
          // THE FLAG IS ON FROM THE MORNING, not from activity 09. It used to be
          // introduced two-thirds of the way through the day, which meant everybody
          // spent Part 1 approving edits one at a time inside a container built to
          // make that unnecessary - the twenty-minute challenge budget going on
          // keystrokes that protect nothing. The isolation argument does not get
          // stronger at 3pm; it is true from the moment this window opens.
          label: "Open a third window and start Claude in it",
          code: "docker compose -f docker-compose.workshop.yml exec claude-container claude --dangerously-skip-permissions",
          where: "host",
        },
      ],
    },
  ],
  // Not a terminal, so it is not a fourth numbered window - but it is the thing that
  // tells you the three above worked.
  after: {
    body:
      "That is the whole morning. You will know it worked when the app loads:",
    command: {
      label: "Check the site is up — open this in your browser",
      code: "http://localhost:5173",
      where: "host",
    },
  },
  // The flag on terminal 3's command, explained where the reader first meets it.
  // It used to live on activities 09 and 10, in two identical copies, beside a
  // command that no longer exists on either page.
  flagNote:
    "<strong>About that flag.</strong> <code>--dangerously-skip-permissions</code> turns off every approval prompt — the deck calls it YOLO mode, and on its own it is exactly as reckless as it sounds. What makes it reasonable <em>here</em> is the layer underneath it: this window is a shell inside the container, with its own filesystem and its own network, and nothing Claude does in it can reach the rest of your machine. That is the isolation the <em>Levels of Safety</em> slide puts first, and it is the only reason the speed is worth having. <strong>Do not take the flag home</strong>, where nothing is containing it.",
  // Windows-container mode runs the environment CHECK, not the workshop. Everything
  // the day itself uses is a Linux image, and one Docker daemon cannot serve both
  // modes at once.
  note: {
    only: ["windows-windows"],
    body:
      "<strong>You are in Windows-container mode.</strong> That is fine for the environment check — there is a Windows-container version of it — but the workshop stack itself is Linux images, and Docker Desktop cannot run both modes at once. Switch Docker Desktop to <strong>Linux containers</strong> before the first activity, and use Git Bash for the commands above. Ask us on the day if you are unsure; do not spend the morning on it.",
  },
};

const RECOVER = {
  summary: "The app stopped working?",
  cta: "Click here to restart it",
  body:
    "Only if <code>http://localhost:5173</code> has stopped answering. This restarts the API and the site <em>inside</em> the running container — you do not lose your shell, your Claude session, or any uncommitted work, and it does not reinstall anything. Give it a few seconds, then reload the page. If it still will not come up, the script prints which log to read.",
  command: {
    label: "Restart the app inside the container",
    code: "start-app.sh --restart",
    where: "container",
  },
}

// For the one person in the room who did not finish the last activity - and nobody
// else. It replaces the numbered "What to do" list that used to open every page: the
// instructions come from the front of the room now, and a reader working through the
// activities in order already knows what this is.
//
// COLLAPSED, and phrased as a question, because that is the only reader it is for.
// Open by default it would be the first thing everybody reads, which is how the old
// list earned its "this is noise" verdict.
//
// The command is NOT in the activity's Commands list. The checkpoint jump is what you
// run INSTEAD of the previous activity, not a step of this one, and every page was
// opening with a command that most of the room must not run.
const CATCH_UP = {
  summary: "Didn't finish the last activity?",
  cta: "Click here to catch up",
  body:
    "Everyone starts this activity from the same code. This parks whatever you have on a <code>wip/</code> branch first — nothing you wrote is thrown away — and then moves <code>app/</code> to the finished state of the activity before this one. If you did finish the last activity, you are already here and there is nothing to run.",
  label: "Catch up to the start of this activity",
  where: "host",
}

const activities = [
  {
    slug: "environment-check",
    title: "Environment Check",
    intent: "I want to prove my setup works",
    part: "Before we start",
    from: null,
    to: "cp-00",
    summary:
      "One command that checks six things and gives you a straight answer. Run it before the workshop, not on the day.",
    // Renders the platform switcher in place of a fixed `commands` list. The exact
    // commands differ by operating system AND, on Windows, by which container mode
    // Docker is in — so they come from PLATFORMS above rather than being repeated
    // here, where the two copies would drift.
    platformSetup: true,
    // ONE page, not two. This activity used to render at 01-environment-check.html
    // while a standalone environment-setup.html rendered the same platformSwitcher()
    // from the same data with a different half of the surrounding content — the
    // troubleshooting list on one, the app-clone note and the cheat on the other.
    // Whichever you were linked to, the other half was missing. This override points
    // the activity at the filename the header, the index tile and every pre-workshop
    // link already used, so there is one page and it has everything.
    page: "environment-setup.html",
    // Absorbed from that standalone page. It answers "why am I being asked a second
    // question?" - a question that only ever occurs to Windows attendees, and only
    // after they have been asked it. Hence `whyOnly`: on the standalone page this
    // was unconditional prose and a Mac attendee who had already picked macOS was
    // still being told why Windows is complicated.
    whyOnly: ["windows-linux", "windows-windows"],
    whyHeading: "Why Windows gets a second question",
    why: [
      'On Windows, "do you have Docker?" is not enough of a question. Docker Desktop runs either Linux containers or Windows containers, and it cannot do both at once. Every image the standard check uses is a Linux image, so running it in Windows-container mode fails at the build step — and it used to blame your network while doing it.',
      "Both checks now notice when you have run the wrong one and point you at the other, so a wrong guess costs you one command. But it is faster to just ask.",
    ],
    // The thirteen failure-by-failure fixes, also absorbed. They render after the
    // success line, which is where somebody whose check just failed is looking.
    troubleshooting: true,
    // NO `steps` HERE, on purpose. The four "Step N" headings on this page are the
    // list: each one names the step AND carries the commands for it. A numbered
    // summary above them could only restate that in less detail, and the page was
    // telling its sequence twice over.
    success:
      "The last line reads <strong>ALL 6 CHECKS PASSED</strong>. That is the whole signal — there is no second step. Open <code>screenshots/verify.png</code> if you want to see the proof.",
    note:
      "<strong>The first check clones the app for you.</strong> The application you spend the day on lives in its own repository, and check 1 clones it into <code>app/</code> — so there is no second <code>git clone</code> to remember. That folder is where all your work happens, and it is what <code>./checkpoint.sh</code> moves between checkpoints. If you see <code>no checkpoints published yet</code> beside that check, nothing is wrong: the ladder is published one rung at a time.",
    cheat: [
      "There is no shortcut past this one, and you do not want one — every later activity assumes it passed.",
      "If a check fails, the script names the cause and the fix and writes <code>verify-report.txt</code>. Paste that file when you ask for help rather than describing the problem.",
      "Ran the wrong one for your setup? No harm done — each script detects the wrong container mode and points you at the other one instead of failing confusingly.",
    ],
  },
  {
    slug: "coding-challenges",
    title: "Coding Challenges",
    intent: "I want to feel what a whole-codebase edit is like",
    part: "Part 1 — AI Coding",
    from: "cp-00",
    to: "cp-01",
    summary:
      "Pick one of two cross-cutting changes that would take half a day by hand. Twenty minutes with an agent that can see the whole repo.",
    where: WHERE,
    // `after: true` puts a command BELOW the prompts rather than above them, under
    // its own heading. The order on the page is then the order of the activity: here
    // is the window, here is what to paste, here is how you check it. Before this,
    // every page listed "run the CI gates" before the prompt whose work it checks.
    commands: [
      {
        label: "Run the same gates CI runs, when you think you are done",
        after: true,
        code: "./scripts/ci-check.sh",
        where: "container",
      },
    ],
    prompts: [
      {
        label: "Challenge 1 — Refactor-Rename",
        text: "Rename 'Campaign' to 'Proposal' across the entire codebase, including API endpoints, documentation, and database references. Update the tests to match and make sure they still pass.",
      },
      {
        label: "Challenge 2 — Observability",
        text: "Add structured JSON request logging using the existing pino logger. Each log line should include the method, path, status code, duration in milliseconds, and a correlation ID that follows the request through the system.",
      },
    ],
    success:
      "The change is applied across every file it touches — including the ones you would have forgotten — and the tests still pass.",
    cheat: [
      "Twenty minutes is deliberately tight. If you run out, that is fine and expected.",
      "<code>./checkpoint.sh 1</code> lands you on the finished state so you start the next activity level with everyone else.",
      "Your unfinished attempt is committed to a <code>wip/</code> branch first — nothing is thrown away.",
    ],
  },
  {
    slug: "agent-sight",
    title: "Give Your Agent Sight",
    intent: "I want my agent to see the UI it is changing",
    part: "Part 1 — AI Coding",
    from: "cp-01",
    to: "cp-02",
    summary:
      "Your container already has Playwright. The skill is asking the agent to use it — to capture the page <em>before</em> it builds, then prove with a second screenshot that the thing it claims to have built is actually on screen.",
    where: WHERE,
    commands: [
      {
        label: "Confirm the agent has a browser to drive",
        code: "claude mcp list",
        where: "container",
      },
      {
        label: "Screenshots it takes land here, on your machine",
        after: true,
        code: "screenshots/",
        where: "host",
      },
    ],
    prompts: [
      {
        label: "1. Baseline — run this before you ask for any code",
        text: "Use Playwright to open http://127.0.0.1:5173, navigate to the Explore Missions page, and save a screenshot to /screenshots/explore-before.png. Do not change any code yet. Tell me what is on the page right now — what you actually see, not what the code says should be there.",
      },
      {
        label: "2. Build it",
        text: "Add a 'Trending Missions' section to the Explore Missions page: the three most popular live missions by contributor count, shown above the main grid. Match the existing page's styling and add tests.",
      },
      {
        label: "3. Prove it",
        text: "Use Playwright to screenshot the Explore Missions page again to /screenshots/explore-after.png, compare it against explore-before.png, and tell me what visibly differs. Then click through the page as a user would and report anything that errors or looks wrong. If Trending Missions did not render, say so plainly rather than explaining why it should have worked.",
      },
    ],
    success:
      "Two screenshots on disk that the agent captured itself, without you driving a browser — and the only difference between them is the feature you asked for.",
    cheat: [
"If the agent says it cannot find a browser, check <code>claude mcp list</code> inside the container — the Playwright MCP server should be listed.",
      "Agent built it before taking the baseline? That is the mistake this activity is about. <code>git stash</code>, screenshot, <code>git stash pop</code> — then make it compare properly.",
      "Want to read a working version instead? The <code>verify/</code> directory drives a real browser in a container and captures a screenshot — it is what your environment check ran this morning.",
      "This matters more than it looks: everything in Part 3 depends on an agent that can check its own work.",
    ],
  },
  {
    slug: "mission-updates-by-prompt",
    title: "Mission Updates, by Prompt",
    intent: "I want to see how far a plain prompt gets me",
    part: "Part 2 — Prompt Engineering",
    from: "cp-02",
    to: "cp-03",
    summary:
      "Build Mission Updates twice — once from a one-line prompt, once from a long one. This is the baseline everything later is measured against.",
    where: WHERE,
    commands: [
      {
        label: "Look at what it built — the site reloads as files change",
        after: true,
        code: "http://localhost:5173",
        where: "host",
      },
    ],
    prompts: [
      {
        label: "The micro-prompt — use exactly this, resist improving it",
        text: "Add Mission Updates to the app.",
      },
      {
        label: "The mega-prompt — starting point, make it yours",
        text: "Add a Mission Updates feature to the app. Campaign owners should be able to post updates to their campaign, and backers should be able to read them on the campaign page. Updates need a title, a body, and a timestamp. Only the campaign owner can post. Show the most recent updates first. Add API endpoints for creating and listing updates, a database migration, React components for the campaign page, and tests for all of it. Follow the existing patterns in the campaigns feature folder.",
      },
    ],
    success:
      "Two working-ish attempts and a clear sense of what neither prompt managed to pin down.",
    cheat: [
      "<code>./checkpoint.sh 3</code> has both attempts already made.",
      "Do not polish these. They are meant to be mediocre — that is the point of the comparison later.",
    ],
  },
  {
    slug: "create-the-spec",
    title: "Create the Spec",
    intent: "I want to specify it properly this time",
    part: "Part 2 — Prompt Engineering",
    from: "cp-03",
    to: "cp-04",
    summary:
      "Write <code>mission-updates.spec.md</code> — role, context, standards, acceptance criteria — then build from it and compare.",
    where: WHERE,
    commands: [
      {
        label: "The spec you are writing lives here",
        after: true,
        code: "specs/mission-updates.spec.md",
        where: "container",
      },
    ],
    prompts: [
      {
        label: "Spec skeleton — fill this in",
        text: `# Mission Updates — Specification

## Role
You are a senior full-stack engineer working in this codebase.

## Context
- Which files and folders are involved:
- Which existing feature is the closest template:
- Which patterns and conventions must be followed:

## Standards
- Reference: specs/standards/
- Tests required:
- Error handling:

## Acceptance criteria
- [ ]
- [ ]
- [ ]

## Out of scope
-`,
      },
      { label: "Then build from it", text: "Read mission-updates.spec.md and implement it exactly. Check your work against the acceptance criteria before you tell me it's done." },
    ],
    success:
      "The difference between this and the mega-prompt is visible without being told what to look for.",
    cheat: [
      "<code>./checkpoint.sh 4</code> has a worked spec if you would rather read a good one than write your first one.",
      "Reading a strong spec before writing your own is a legitimate way to learn this — take it if you are short on time.",
    ],
  },
  {
    slug: "brand-your-app",
    title: "Brand Your Mission Updates",
    intent: "I want the app to look unmistakably mine",
    part: "Part 2 — Prompt Engineering",
    from: "cp-04",
    to: "cp-05",
    summary:
      "Invent a brand, write it down, and have the agent regenerate the app's design tokens from it. Everyone's screen ends up different.",
    where: WHERE,
    commands: [
      {
        label: "Your brand, and the tokens generated from it",
        after: true,
        code: "specs/standards/brand.md\npackages/client/src/tokens.css",
        where: "container",
      },
    ],
    prompts: [
      {
        label: "1. Let it interview you",
        text: "Interview me to produce brand guidelines for this product. Ask me about the audience, what I want them to feel, the voice and tone, and what I am not willing to look like. Ask one question at a time and push back if my answers are vague. When we're done, write the result to specs/standards/brand.md.",
      },
      {
        label: "2. Make the app wear it",
        text: "Read specs/standards/brand.md and regenerate packages/client/src/tokens.css from it. Change only the Tier 1 identity tokens — the semantic tokens and the components must not be edited. Then use Playwright to screenshot the campaign page so I can see the result.",
      },
    ],
    success:
      "The whole app is wearing your brand, and no component file was edited to do it.",
    cheat: [
      "<code>./checkpoint.sh 5</code> gives you <em>a</em> brand — but not <em>your</em> brand. This is the one checkpoint that is personal.",
      "If you want to keep what you wrote, note the <code>wip/</code> branch name the jump prints. You can get back to it any time.",
      "Why it works with no component changes: <code>tokens.css</code> is two-tier. Identity tokens hold the brand; semantic tokens sit underneath; components only ever reference the semantic layer. Change the top, the whole app follows.",
    ],
  },
  {
    slug: "build-it-properly",
    title: "Build It Properly",
    intent: "I want the AI to interview me before it writes anything",
    part: "Part 2 — Prompt Engineering",
    from: "cp-05",
    to: "cp-06",
    summary:
      "Spec plus brand, through a Socratic interview, all the way to working code — and it renders in your colours.",
    where: WHERE,
    commands: [
      {
        label: "Prove it works before you believe it",
        after: true,
        code: "./scripts/ci-check.sh",
        where: "container",
      },
    ],
    prompts: [
      {
        label: "The Socratic build",
        text: "Read mission-updates.spec.md and specs/standards/brand.md. Before writing any code, interview me about what the spec leaves ambiguous — the existing campaign routes, the database schema, API conventions, backward compatibility. Ask one question at a time. Then produce a brief, turn the brief into explicit tasks, and only then write the code. Run the tests when you're done.",
      },
    ],
    success: "Mission Updates works, tests pass, and it looks like yours.",
    cheat: [
      "<code>./checkpoint.sh 6</code> has the finished feature.",
      "Notice how different the questions are from the brand exercise. Same method, brownfield instead of greenfield — the agent can ask about the schema because the real code is right there.",
    ],
  },
  {
    slug: "autonomous-agent",
    note:
      "<strong>You are watching, not driving.</strong> The loop runs <code>claude --dangerously-skip-permissions --print</code> headlessly against a prompt, and the interesting part is what bounds it: <code>MAX_ITERATIONS</code>, <code>COOLDOWN_SECONDS</code>, <code>TIMEOUT_SECONDS</code>, and a 4&nbsp;GB / 2&nbsp;CPU ceiling, all set in <code>docker-compose.workshop.yml</code> where you can read them. Constraints are what make autonomy safe — an unbounded loop is the Loop of Death from the previous slide.",
    title: "Build an Autonomous Agent",
    intent: "I want to let it run on its own — safely",
    part: "Part 3 — Orchestration",
    from: "cp-06",
    to: "cp-07",
    summary:
      "Hand the same feature to an agent that loops without you. The container is the safety boundary; the guardrails are the actual lesson.",
    where: WHERE,
    commands: [
      {
        label: "Read what it is about to do",
        code: "cat app/autonomous-demo/README.md",
        where: "host",
      },
      {
        label: "Start the agent. It runs headless — you watch, you do not drive",
        code: "docker compose -f docker-compose.workshop.yml --profile l4 up autonomous-agent",
        where: "host",
      },
      {
        label: "Follow what it is doing",
        code: "docker compose -f docker-compose.workshop.yml logs -f autonomous-agent",
        where: "host",
      },
      {
        label: "Stop it early if you have seen enough",
        code: "docker compose -f docker-compose.workshop.yml --profile l4 down autonomous-agent",
        where: "host",
      },
    ],
    success:
      "Either it works, or you watch it hit the Loop of Death. Both are the intended outcome.",
    cheat: [
      "<code>./checkpoint.sh 7</code> if the run goes sideways and you need to move on.",
      "Getting stuck here is not failing the exercise — a fix-break-fix cycle is exactly what the guardrails exist to stop.",
      "Never run this outside a container against a real codebase. That is the whole reason the boundary is here.",
    ],
  },
  {
    slug: "plan-first",
    note:
      "<strong>Permission prompts are off in here.</strong> Your Claude terminal has been running <code>--dangerously-skip-permissions</code> since this morning — <a href=\"start-your-day.html\">why that is defensible in there, and nowhere else</a>.",
    title: "Plan-First Orchestration",
    intent: "I want one agent to plan and another to execute",
    part: "Part 3 — Orchestration",
    from: "cp-07",
    to: "cp-08",
    summary:
      "Split the work. A planning agent produces the plan; a separate coding agent executes it and nothing else.",
    where: WHERE,
    commands: [
    ],
    prompts: [
      {
        label: "1. The planning agent",
        text: "You are a planning agent. Do not write any code. Produce a detailed implementation plan for this task: which files are affected, what is likely to break, the ordered steps, and which tests must pass before it can be called done. Write the plan to plan/ready/mission-updates-plan.md.",
      },
      {
        label: "2. The coding agent (fresh session)",
        text: "Read plan/ready/mission-updates-plan.md and execute it exactly as written. Do not redesign the approach — if a step looks wrong, stop and tell me rather than improvising. Run the tests named in the plan when you're done.",
      },
    ],
    success:
      "The quality gap against the autonomous attempt is obvious — and the only thing that changed was the handoff.",
    cheat: [
      "<code>./checkpoint.sh 8</code> has the handoff already done.",
      "The planner having broad context while the coder has narrow focus is the point. Do not merge them back together.",
    ],
  },
  {
    slug: "automated-review",
    note:
      "<strong>Permission prompts are off in here.</strong> Your Claude terminal has been running <code>--dangerously-skip-permissions</code> since this morning — <a href=\"start-your-day.html\">why that is defensible in there, and nowhere else</a>.",
    title: "Automated Code Review",
    intent: "I want the agent to review the work and report up",
    part: "Part 3 — Orchestration",
    from: "cp-08",
    to: null,
    summary:
      "A third specialist reads the diff, summarises the tests, and writes something a non-technical stakeholder could act on.",
    where: WHERE,
    commands: [
      {
        label: "Collect the diff the reviewer will read",
        code: "git diff main...HEAD > /tmp/review.diff",
        where: "container",
      },
    ],
    prompts: [
      {
        label: "The review agent",
        text: "You are a code reviewer. Read the diff in /tmp/review.diff and identify risks, regressions, and style violations. Report every issue you find, including ones you're uncertain about — give each a confidence level and a severity rather than filtering them out yourself.",
      },
      {
        label: "The executive summary",
        text: "Now summarise this for a non-technical stakeholder in three sentences: what changed, what the risk is, and what happens next. No jargon.",
      },
    ],
    success:
      "You planned a feature, delegated it, and reviewed it — without writing a line of code yourself.",
    cheat: [
      "Nothing to skip to. This is the last one.",
      "If you are behind, <code>./checkpoint.sh 8</code> gives you a diff worth reviewing.",
    ],
  },
];

module.exports = { activities, LINKS, REPO_URL, PLATFORMS, DETECT_COMMAND, CREDENTIALS, SETUP_STATES, TROUBLESHOOTING, HELP, FIRST_RUN_NOTE, TERMINALS, RECOVER, CATCH_UP };
