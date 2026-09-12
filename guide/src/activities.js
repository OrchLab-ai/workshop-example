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
// in each case. An attendee in Windows-container mode who runs ./verify.sh gets a
// build failure that reads "this is almost always a network problem", which sends
// them off debugging their wifi. So the guide asks the question up front and has
// them RUN a command to answer it rather than guess.
//
// macOS is deliberately a single pathway: Docker Desktop there has no
// Windows-container mode at all, so there is nothing to determine.
const DETECT_COMMAND = "docker info --format '{{.OSType}}'";

const PLATFORMS = [
  {
    id: "macos",
    os: "macos",
    label: "macOS",
    // Shown on the pathway panel so someone can sanity-check they picked right.
    confirm: "Docker Desktop on macOS only runs Linux containers — there is nothing to determine.",
    shell: "Terminal",
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "cp .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "./verify.sh" },
      { label: "If port 8080 is already taken", code: "VERIFY_PORT=8081 ./verify.sh" },
    ],
  },
  {
    id: "windows-linux",
    os: "windows",
    label: "Linux containers",
    detectValue: "linux",
    confirm:
      "This is the usual setup on Windows, and the better-tested path.",
    shellNote: "which comes with Git for Windows — not PowerShell or CMD",
    shell: "Git Bash",
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "cp .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "./verify.sh" },
      { label: "If port 8080 is already taken", code: "VERIFY_PORT=8081 ./verify.sh" },
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
    commands: [
      { label: "1. Clone and enter the repo", code: `git clone ${REPO_URL}.git\ncd workshop-example` },
      { label: "2. Create your .env", code: "copy .env.example .env" },
      { label: "3. Get your token, then paste it into .env", code: "claude setup-token" },
      { label: "4. Run the check", code: "powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
      { label: "If port 8080 is already taken", code: "$env:VERIFY_PORT=8081; powershell -ExecutionPolicy Bypass -File windows\\verify.ps1" },
    ],
    notes: [
      "The first run pulls a ~2 GB Windows base image, so give it longer than you would expect. Later runs reuse it.",
      'If <strong>Switch to Windows containers</strong> appears to do nothing, the <code>Containers</code> optional feature is off. It is separate from Hyper-V. Enable it from an elevated PowerShell and <strong>reboot</strong>: <code>Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart</code>',
    ],
  },
];

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
    commands: [
      { label: "Start from the right checkpoint", code: "./checkpoint.sh 0" },
      { label: "Run the tests when you think you're done", code: "./scripts/ci-check.sh" },
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
      "Pick <strong>one</strong> challenge and copy its prompt.",
      "Work in <code>packages/</code> — the agent has the whole repo in context.",
      "Run the tests when you think you are done.",
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
      "Wire Playwright into the container so the agent can open the running app, navigate it, and screenshot what it did.",
    commands: [
      { label: "Start from the right checkpoint", code: "./checkpoint.sh 1" },
    ],
    prompts: [
      {
        label: "The prompt",
        text: "Add Playwright to this container so you can open the running app, navigate it, and take screenshots. Then screenshot the page you changed in the last exercise and show me before and after.",
      },
    ],
    steps: [
      "Paste the prompt and let the agent work out the Docker wiring itself.",
      "Point it at the page you changed in the last activity.",
      "Ask for a before and after.",
    ],
    success:
      "You have two screenshots on disk that the agent captured itself, without you driving a browser.",
    cheat: [
      "<code>./checkpoint.sh 2</code> gives you a container that already has sight.",
      "Want to read a working version instead of building one? The <code>verify/</code> directory is exactly this, wired up — it is what your environment check ran.",
      "This matters more than it looks: everything in Part 3 depends on an agent that can check its own work.",
    ],
    links: [
      { label: "Playwright in Docker — standalone reference", url: "https://github.com/OrchLab-ai/playwright-in-docker" },
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
    commands: [{ label: "Start from the right checkpoint", code: "./checkpoint.sh 2" }],
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
      "Run the micro-prompt. Keep whatever you get — do not fix it.",
      "Run the mega-prompt in a fresh session.",
      "Look at both. Note what each one had to guess at.",
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
    commands: [
      { label: "Start from the right checkpoint", code: "./checkpoint.sh 3" },
      { label: "Read a worked spec instead of writing one", code: "./checkpoint.sh 4" },
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
      "Write the spec file: who the AI is acting as, what context applies, which standards to follow, how you will know it is done.",
      "Feed it to the agent and ask for Mission Updates.",
      "Compare against your two prompt attempts. Same feature, same codebase, third try.",
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
    commands: [{ label: "Start from the right checkpoint", code: "./checkpoint.sh 4" }],
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
      "Let the agent interview you: who is this for, what should they feel, what are you not willing to look like.",
      "Save the result as <code>specs/standards/brand.md</code>.",
      "Ask the agent to regenerate <code>packages/client/src/tokens.css</code> from your brand.",
      "Screenshot it with the Playwright sight you wired up earlier.",
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
    commands: [{ label: "Start from the right checkpoint", code: "./checkpoint.sh 5" }],
    prompts: [
      {
        label: "The Socratic build",
        text: "Read mission-updates.spec.md and specs/standards/brand.md. Before writing any code, interview me about what the spec leaves ambiguous — the existing campaign routes, the database schema, API conventions, backward compatibility. Ask one question at a time. Then produce a brief, turn the brief into explicit tasks, and only then write the code. Run the tests when you're done.",
      },
    ],
    steps: [
      "Hand the agent your spec and your brand and let it ask about the gaps.",
      "Watch which questions it asks: routes, schema, API conventions, backward compatibility.",
      "Take it through brief, tasks, then code.",
    ],
    success: "Mission Updates works, tests pass, and it looks like yours.",
    cheat: [
      "<code>./checkpoint.sh 6</code> has the finished feature.",
      "Notice how different the questions are from the brand exercise. Same method, brownfield instead of greenfield — the agent can ask about the schema because the real code is right there.",
    ],
  },
  {
    slug: "autonomous-agent",
    title: "Build an Autonomous Agent",
    intent: "I want to let it run on its own — safely",
    part: "Part 3 — Orchestration",
    from: "cp-06",
    to: "cp-07",
    summary:
      "Hand the same feature to an agent that loops without you. The container is the safety boundary; the guardrails are the actual lesson.",
    commands: [
      { label: "Start from the right checkpoint", code: "./checkpoint.sh 6" },
      { label: "Read the loop's own README first", code: "cat autonomous-demo/README.md" },
      { label: "Run the loop", code: "cd autonomous-demo && docker compose up --build" },
    ],
    steps: [
      "Follow <code>autonomous-demo/README.md</code>.",
      "Read the loop prompt before you run it: analyse, change, test, verify, repeat.",
      "Set the guardrails — iteration cap, cost limit, rollback on failing tests.",
      "Watch. Note where it gets stuck and where it succeeds.",
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
    title: "Plan-First Orchestration",
    intent: "I want one agent to plan and another to execute",
    part: "Part 3 — Orchestration",
    from: "cp-07",
    to: "cp-08",
    summary:
      "Split the work. A planning agent produces the plan; a separate coding agent executes it and nothing else.",
    commands: [{ label: "Start from the right checkpoint", code: "./checkpoint.sh 7" }],
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
      "Have a planning agent produce the plan: affected files, likely breakages, steps, tests that must pass.",
      "Start a <strong>fresh</strong> session and feed that plan to a coding agent as its instruction set.",
      "Compare the result to the autonomous run.",
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
    title: "Automated Code Review",
    intent: "I want the agent to review the work and report up",
    part: "Part 3 — Orchestration",
    from: "cp-08",
    to: null,
    summary:
      "A third specialist reads the diff, summarises the tests, and writes something a non-technical stakeholder could act on.",
    commands: [
      { label: "Start from the right checkpoint", code: "./checkpoint.sh 8" },
      { label: "Get the diff to review", code: "git diff main...HEAD > /tmp/review.diff" },
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
      "Feed the git diff to a review agent — risks, regressions, style violations.",
      "Have it summarise the test results: passed, failed, missing.",
      "Ask for three sentences for leadership: what changed, what risk, what is next.",
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
