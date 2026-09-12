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
const LINKS = [
  { label: "The workshop container (this repo)", url: REPO_URL },
  { label: "Starting point — cp-00", url: `${REPO_URL}/tree/cp-00` },
  { label: "Workshop deck", url: "https://orchlab.ai/workshop-deck" },
  { label: "Discord — questions during and after", url: "https://discord.gg/RJS785wXmv" },
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
  "Start from wherever you keep projects — the first command creates the <code>workshop-example</code> folder, and every command after it runs from <strong>inside</strong> that folder.";

const TOKEN_NOTE =
  "<strong>About step 3.</strong> <code>claude setup-token</code> is a command of the Claude Code CLI, so it needs Claude Code installed on <strong>your own machine</strong> (<code>npm install -g @anthropic-ai/claude-code</code>) and a Claude subscription. It opens a browser window to sign in to your Claude account, and then prints a long-lived token to the terminal. Copy that value into <code>.env</code> as <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Run it on your host machine, never inside the container.";

const TOKEN_ALT_NOTE =
  "<strong>No subscription, or you would rather use an API key?</strong> Create one at <a href=\"https://console.anthropic.com\">console.anthropic.com</a>, put it in <code>.env</code> as <code>ANTHROPIC_API_KEY</code>, and leave <code>CLAUDE_CODE_OAUTH_TOKEN</code> blank. Set <strong>one</strong> of the two, not both. Either way the value is a credential: <code>.env</code> is gitignored, and it should not be pasted into chat along with a report.";

const PLATFORMS = [
  {
    id: "macos",
    os: "macos",
    label: "macOS",
    // Shown on the pathway panel so someone can sanity-check they picked right.
    confirm: "Docker Desktop on macOS only runs Linux containers — there is nothing to determine.",
    shell: "Terminal",
    cwd: CWD_CLONE,
    notes: [TOKEN_NOTE, TOKEN_ALT_NOTE],
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "cp .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "./verify-setup.sh" },
      { label: "If port 8080 is already taken", code: "VERIFY_PORT=8081 ./verify-setup.sh" },
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
    notes: [TOKEN_NOTE, TOKEN_ALT_NOTE, DOCKER_USERS_NOTE],
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "cp .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "./verify-setup.sh" },
      { label: "If port 8080 is already taken", code: "VERIFY_PORT=8081 ./verify-setup.sh" },
    ],
  },
  {
    id: "windows-windows",
    os: "windows",
    label: "Windows containers",
    detectValue: "windows",
    confirm:
      "Less common, and usually deliberate — .NET Framework work needs it. You do <strong>not</strong> have to switch modes: there is a Windows-container check that proves the same five things.",
    shell: "PowerShell",
    cwd: CWD_CLONE,
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "copy .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
      { label: "If port 8080 is already taken", code: "$env:VERIFY_PORT=8081; powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
    ],
    notes: [
      TOKEN_NOTE,
      TOKEN_ALT_NOTE,
      "The first run pulls a ~2 GB Windows base image, so give it longer than you would expect. Later runs reuse it.",
      DOCKER_USERS_NOTE,
      'If <strong>Switch to Windows containers</strong> appears to do nothing, the <code>Containers</code> optional feature is off. It is separate from Hyper-V. Enable it from an elevated PowerShell and <strong>reboot</strong>: <code>Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart</code>',
    ],
  },
];

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
const WHERE = {
  shell: "two places — your machine, and the container",
  cwd:
    'Commands marked <strong>your machine</strong> run in Git Bash (Windows) or Terminal ' +
    '(macOS), from the root of your <code>workshop-example</code> clone. Commands marked ' +
    '<strong>in the container</strong> run after you are inside it — see ' +
    '<em>Start your day</em> below.',
}

// The one-time start, repeated on every activity page because people arrive at the
// guide mid-morning having closed their terminal.
const DAILY_START = [
  {
    label: "1. Start the stack (once a day — leave it running)",
    code: "docker compose -f docker-compose.workshop.yml up -d",
    where: "host",
  },
  {
    label: "2. Get a shell inside the container",
    code: "docker compose -f docker-compose.workshop.yml exec claude-container bash",
    where: "host",
  },
  {
    label: "3. Check the site is up — open this in your browser",
    code: "http://localhost:5173",
    where: "host",
  },
]

const activities = [
  {
    slug: "environment-check",
    title: "Environment Check",
    intent: "I want to prove my setup works",
    part: "Before we start",
    from: null,
    to: "cp-00",
    summary:
      "One command that checks five things and gives you a straight answer. Run it before the workshop, not on the day.",
    // Renders the platform switcher in place of a fixed `commands` list. The exact
    // commands differ by operating system AND, on Windows, by which container mode
    // Docker is in — so they come from PLATFORMS above rather than being repeated
    // here, where the two copies would drift.
    platformSetup: true,
    steps: [
      "Pick your operating system below. On Windows there is one extra question, and a command that answers it for you.",
      "Clone the repo and <code>cd</code> into it.",
      "Copy <code>.env.example</code> to <code>.env</code>.",
      "Run <code>claude setup-token</code> on your own machine and paste the value into <code>.env</code>.",
      "Run the check for your platform.",
    ],
    success:
      "The last line reads <strong>ALL 5 CHECKS PASSED</strong>. That is the whole signal — there is no second step. Open <code>screenshots/verify.png</code> if you want to see the proof.",
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
      "Pick one of three changes that would take half a day by hand. Twenty minutes with an agent that can see the whole repo.",
    where: WHERE,
    commands: [
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint — parks any work you have, then moves you",
        code: "./checkpoint.sh 0",
        where: "host",
      },
      {
        label: "Start Claude Code. It runs in here, not on your machine",
        code: "claude",
        where: "container",
      },
      {
        label: "Run the same gates CI runs, when you think you are done",
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
      {
        label: "Challenge 3 — New Feature",
        text: "Add a 'Trending Missions' section to the Explore page: the three most popular live campaigns by contributor count, shown above the main grid. Match the existing page's styling and add tests.",
      },
    ],
    steps: [
      "Jump to the starting checkpoint, so everyone begins the challenge from the same code.",
      "Get a shell in the container and start Claude Code there. It runs inside the container all day — that is what keeps it away from the rest of your machine.",
      "Pick <strong>one</strong> challenge and paste its prompt.",
      "Let the agent find the files itself. You do not need to know the layout, and you should not " +
        "go hunting for the right folder first — the point of the exercise is that the agent has the " +
        "whole repo in context and you do not.",
      "Run <code>./scripts/ci-check.sh</code> in the container when you think you are done, and read what the agent changed before you believe it.",
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
      "Your container already has Playwright. The skill is asking the agent to use it — to open the running app, look at what it changed, and prove it with a screenshot.",
    where: WHERE,
    commands: [
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 1",
        where: "host",
      },
      {
        label: "Confirm the agent has a browser to drive",
        code: "claude mcp list",
        where: "container",
      },
      {
        label: "Start Claude Code, then ask it to look at the page itself",
        code: "claude",
        where: "container",
      },
      {
        label: "Screenshots it takes land here, on your machine",
        code: "screenshots/",
        where: "host",
      },
    ],
    prompts: [
      {
        label: "Ask it to look",
        text: "Use Playwright to open http://localhost:5173, navigate to the page I changed in the last exercise, and take a screenshot to /screenshots. Then tell me what you actually see on the page — not what the code says it should do.",
      },
      {
        label: "Ask it to compare",
        text: "Use Playwright to screenshot the page before and after your change, save both to /screenshots, and tell me what visibly differs. If the change did not render, say so plainly rather than explaining why it should have worked.",
      },
      {
        label: "Ask it to check itself",
        text: "Use Playwright to verify the change actually works in the browser: click through the flow a user would take, and report anything that errors or looks wrong. Fix what you find, then screenshot the result.",
      },
    ],
    steps: [
      "Start Claude Code in the container — Playwright and its MCP server are already installed, so there is nothing to wire up.",
      "Paste one of the prompts. The words that matter are <strong>use Playwright</strong>: without them the agent will reason about the code instead of looking at the page.",
      "Read what it reports back against what you can see yourself at <code>http://localhost:5173</code>.",
      "Check the screenshots it wrote — they land in <code>screenshots/</code> on your own machine.",
    ],
    success:
      "You have two screenshots on disk that the agent captured itself, without you driving a browser.",
    cheat: [
"If the agent says it cannot find a browser, check <code>claude mcp list</code> inside the container — the Playwright MCP server should be listed.",
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
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 2",
        where: "host",
      },
      {
        label: "Start Claude Code",
        code: "claude",
        where: "container",
      },
      {
        label: "Look at what it built — the site reloads as files change",
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
    steps: [
      "Start Claude Code <strong>in the container</strong> — <code>claude</code>, from the shell you opened, not from your own machine.",
      "Paste the micro-prompt. Keep whatever you get and do not fix it: this attempt is the baseline, and its weaknesses are the whole point.",
      "Look at what it built in your own browser at <code>http://localhost:5173</code>. Vite reloads as the agent edits files, so there is nothing to restart.",
      "Exit Claude Code and start it again before the mega-prompt, so the second attempt begins with no memory of the first.",
      "Compare the two, and note what each prompt left the agent to guess at.",
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
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 3",
        where: "host",
      },
      {
        label: "Start Claude Code",
        code: "claude",
        where: "container",
      },
      {
        label: "The spec you are writing lives here",
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
    steps: [
      "Read what is already in <code>specs/</code> first. The app ships standards, domain notes and ADRs — a spec that contradicts them will be argued with.",
      "Write your spec in the container at <code>specs/mission-updates.spec.md</code>: who the agent is acting as, what context applies, which standards to follow, and how you will know it is done.",
      "Start a fresh Claude Code session, hand it the spec, and ask for Mission Updates.",
      "Compare the result against your two prompt attempts at <code>http://localhost:5173</code>. Same feature, same codebase, third try.",
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
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 4",
        where: "host",
      },
      {
        label: "Start Claude Code",
        code: "claude",
        where: "container",
      },
      {
        label: "Your brand, and the tokens generated from it",
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
    steps: [
      "Start Claude Code in the container and let it interview you: who is this for, what should they feel, what are you not willing to look like.",
      "Save the result as <code>specs/standards/brand.md</code>. There is a brand file there already — read it first to see the shape expected, then replace it with yours.",
      "Ask the agent to regenerate <code>packages/client/src/tokens.css</code> from your brand, and to change nothing else.",
      "Ask it to screenshot the result with Playwright. The image lands in <code>screenshots/</code> on your own machine; the live page is at <code>http://localhost:5173</code>.",
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
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 5",
        where: "host",
      },
      {
        label: "Start Claude Code",
        code: "claude",
        where: "container",
      },
      {
        label: "Prove it works before you believe it",
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
    steps: [
      "Start a fresh Claude Code session in the container and hand it both your spec and your brand.",
      "Make it interview you <strong>before</strong> it writes anything. If it starts coding, stop it and ask what it still does not know.",
      "Watch which questions it asks — routes, schema, API conventions, what happens to existing records. Those are the gaps your spec left.",
      "Take it through brief, then tasks, then code.",
      "Run <code>./scripts/ci-check.sh</code> in the container before you believe it, and look at the page yourself.",
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
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 6",
        where: "host",
      },
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
    steps: [
      "Read <code>app/autonomous-demo/README.md</code> on your own machine before starting anything — the loop is far easier to watch if you know what it intends to do.",
      "Read the guardrails in <code>docker-compose.workshop.yml</code>: <code>MAX_ITERATIONS</code>, <code>COOLDOWN_SECONDS</code>, <code>TIMEOUT_SECONDS</code>, and the memory and CPU ceiling. These are the lesson, not the feature it builds.",
      "Start it with the <code>l4</code> profile and follow the log. <strong>You are not driving this one</strong> — there is no prompt to answer.",
      "Watch where it gets stuck as closely as where it succeeds, and stop it once you have seen enough.",
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
      "<strong>About that flag.</strong> <code>--dangerously-skip-permissions</code> turns off every approval prompt — the deck calls it YOLO mode, and on its own it is exactly as reckless as it sounds. What makes it reasonable <em>here</em> is the layer underneath it: Claude has been running inside a container since this morning, with its own filesystem and its own network. That is the isolation the <em>Levels of Safety</em> slide puts first, and it is the only reason the speed is worth having. <strong>Do not take the flag home to your own machine</strong>, where nothing is containing it.",
    title: "Plan-First Orchestration",
    intent: "I want one agent to plan and another to execute",
    part: "Part 3 — Orchestration",
    from: "cp-07",
    to: "cp-08",
    summary:
      "Split the work. A planning agent produces the plan; a separate coding agent executes it and nothing else.",
    where: WHERE,
    commands: [
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 7",
        where: "host",
      },
      {
        label: "Start Claude Code with permission prompts off — see the note below",
        code: "claude --dangerously-skip-permissions",
        where: "container",
      },
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
    steps: [
      "Start Claude Code in the container with permission prompts off — see the note below — and ask it for a <strong>plan only</strong>: affected files, likely breakages, ordered steps, and the tests that must pass.",
      "Have it write the plan to a file, so the next session can read it rather than be told about it.",
      "Exit, and start a <strong>fresh</strong> session. A planning agent that then writes the code itself is not a handoff.",
      "Give the coding agent the plan as its instruction set and nothing else.",
      "Compare the result to the autonomous run. The feature is the same; the only thing that changed is the handoff.",
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
      "<strong>About that flag.</strong> <code>--dangerously-skip-permissions</code> turns off every approval prompt — the deck calls it YOLO mode, and on its own it is exactly as reckless as it sounds. What makes it reasonable <em>here</em> is the layer underneath it: Claude has been running inside a container since this morning, with its own filesystem and its own network. That is the isolation the <em>Levels of Safety</em> slide puts first, and it is the only reason the speed is worth having. <strong>Do not take the flag home to your own machine</strong>, where nothing is containing it.",
    title: "Automated Code Review",
    intent: "I want the agent to review the work and report up",
    part: "Part 3 — Orchestration",
    from: "cp-08",
    to: null,
    summary:
      "A third specialist reads the diff, summarises the tests, and writes something a non-technical stakeholder could act on.",
    where: WHERE,
    commands: [
      ...DAILY_START,
      {
        label: "Jump to the starting checkpoint",
        code: "./checkpoint.sh 8",
        where: "host",
      },
      {
        label: "Collect the diff the reviewer will read",
        code: "git diff main...HEAD > /tmp/review.diff",
        where: "container",
      },
      {
        label: "Start the reviewing agent",
        code: "claude --dangerously-skip-permissions",
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
    steps: [
      "In the container, write the diff to a file. The reviewer should read what changed, not the whole repository.",
      "Start a fresh session as a reviewing agent: risks, regressions, standards violations, and anything the tests do not cover.",
      "Have it summarise the test results — passed, failed, and missing.",
      "Ask for three sentences a non-technical stakeholder could act on: what changed, what the risk is, what happens next.",
    ],
    success:
      "You planned a feature, delegated it, and reviewed it — without writing a line of code yourself.",
    cheat: [
      "Nothing to skip to. This is the last one.",
      "If you are behind, <code>./checkpoint.sh 8</code> gives you a diff worth reviewing.",
    ],
  },
];

module.exports = { activities, LINKS, REPO_URL, PLATFORMS, DETECT_COMMAND };
