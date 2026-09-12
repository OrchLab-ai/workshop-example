# Checkpoints

The workshop builds one feature — **Mission Updates** — four times, once at each
level. Every activity is bracketed by a git tag so that **falling behind in one
exercise never locks you out of the next one.**

If an exercise doesn't land, you are one command from the front of the room.

## Two repositories, and why

The tags are **not** in this repository. They are in the application repository,
which `./verify-setup.sh` clones into `app/` (gitignored here).

The split is on rate of change. This repo — the environment check, the guide,
`checkpoint.sh` itself — changes whenever anything about delivery improves. The
app's nine states change only when the exercises do. A jump is a whole-tree
checkout, so if both lived here, landing on `cp-03` would rewind the guide and
this very script along with the app, and *every* infrastructure commit would
quietly invalidate *all nine* tags.

Keeping them apart means `app/` moves and this repo never does. `manifest.txt`
stays here because rung titles are guide content, not app state; a rung listed
here that has no tag yet is reported as *not published* rather than as an error.

It is a clone rather than a submodule deliberately: a submodule records a pointer
to one exact app commit in this tree, and moving the app independently of that
pointer is precisely what the ladder is for.

## The commands

```bash
./checkpoint.sh --list      # the whole ladder, and what's published
./checkpoint.sh --status    # where am I, and what's next
./checkpoint.sh 4           # jump to the state after activity 4
./checkpoint.sh --parked    # find work an earlier jump parked for you
```

## What a jump actually does

All of it happens inside `app/`. Nothing `checkpoint.sh` does touches this
repository, so your branch here stays wherever you left it.

1. **Parks your work.** If you have uncommitted changes, they are committed to a
   `wip/<timestamp>` branch *before* anything moves. You do not need to have
   committed anything yourself, and nothing is ever discarded — `git stash`
   isn't used, because stashes are too easy to lose track of.
2. **Puts you on a working branch.** You land on `work/cp-04`, not a detached
   HEAD, so you can commit freely without git complaining at you.
3. **Tells you what's next.** The activity this checkpoint unblocks.

Jump to the same checkpoint twice and you *resume* your existing branch —
earlier commits intact. Add `--fresh` to throw that away and start the
checkpoint again from the tag (your work is still parked first).

## Getting parked work back

```bash
./checkpoint.sh --parked
```

Lists every `wip/` branch with a timestamp and how to recover it. If you jumped
ahead and then want your half-finished attempt back, it is there.

## The ladder

| Tag | Contains | Unblocks |
|---|---|---|
| `cp-00` | Clean clone, environment check passing | Part 1 — Coding Challenges |
| `cp-01` | A Part 1 challenge applied | Part 1 — Give Your Agent Sight |
| `cp-02` | Playwright wired in; the agent can see | Part 2 — Blog Engine exercise |
| `cp-03` | Mission Updates from micro/mega prompts | Part 2 — Create the spec |
| `cp-04` | `mission-updates.spec.md` written | Part 2 — Brand Your Mission Updates |
| `cp-05` | Your `brand.md`, with `tokens.css` regenerated from it | Part 2 — Socratic build |
| `cp-06` | Spec-driven Mission Updates in your brand, tests passing | Part 3 — Autonomous agent |
| `cp-07` | Autonomous agent run with guardrails | Part 3 — Plan-First Orchestration |
| `cp-08` | Plan → code handoff complete | Part 3 — Automated Code Review |

> **`cp-05` is yours alone.** The brand exercise has every attendee invent their
> own identity, so from `cp-05` onward your app looks different from everybody
> else's. Jumping to the published `cp-05` gives you *a* brand so you are not
> stuck — but it will not be the one you wrote. If you want to keep yours, note
> the `wip/` branch name that the jump reports.

`manifest.txt` is the single source of truth for this table — `checkpoint.sh`
reads it, so edit there rather than here.

---

## For facilitators: publishing a checkpoint

A tag on the ladder that doesn't exist yet is reported as *not published*
rather than as an error, so a partially-built ladder stays usable.

Tags are published **in the application repository**, not in this one. From a
clone of it (`app/` here is one):

```bash
git -C app tag -a cp-04 -m "Spec written: mission-updates.spec.md"
git -C app push origin cp-04
```

Two things to hold to:

- **Tags must be reachable from the default branch**, otherwise a fresh clone
  won't have the history behind them.
- **Never move a published tag mid-workshop.** An attendee who jumped to `cp-04`
  an hour ago and one who jumps now must land on identical code.
