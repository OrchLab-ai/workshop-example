# Checkpoints

Parts 1 and 2 build up the app and the spec — warm-up challenges, your brand, and
**Mission Updates** specified until an agent could build it with nobody to ask.
Part 3 builds a **harness** that drives the agent headlessly — and it is the harness,
not you, that builds Mission Updates from that spec. Every activity is bracketed by a git
tag so that **falling behind in one exercise never locks you out of the next one.**

If an exercise doesn't land, you are one command from the front of the room.

## Two repositories, and why

The tags are **not** in this repository. They are in the application repository,
which `./verify-setup.sh` clones into `app/` (gitignored here).

The split is on rate of change. This repo — the environment check, the guide,
`checkpoint.sh` itself — changes whenever anything about delivery improves. The
app's ten states change only when the exercises do. A jump is a whole-tree
checkout, so if both lived here, landing on `cp-04` would rewind the guide and
this very script along with the app, and *every* infrastructure commit would
quietly invalidate *all ten* tags.

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
| `cp-01` | Clean clone, environment check passing | Activity 02 — Coding Challenges |
| `cp-02` | Warm-up challenges: Campaign renamed to Proposal, structured request logging | Activity 03 — Give Your Agent Sight |
| `cp-03` | Trending Missions, proved on screen by the agent's own before/after shots | Activity 04 — Blog Engine |
| `cp-04` | Same code as `cp-03` — the Blog Engine exercise is pen and paper | Activity 05 — Create the Spec |
| `cp-05` | `specs/mission-updates.spec.md` written; nothing built | Activity 06 — Brand The App |
| `cp-06` | Your `brand.md`, with `tokens.css` and fonts regenerated from it | Activity 07 — Spec It Properly |
| `cp-07` | `specs/mission-updates.v2.spec.md`, completed by interview; nothing built | Activity 08 — Your First Headless Run |
| `cp-08a` | Activity 08 part-way: the harness built, no safeguards | Activity 08, step 2 — Run it |
| `cp-08b` | Activity 08 part-way: restricted, probe written | Activity 08, step 6 — Run the probe, then what it wrote |
| `cp-08c` | Activity 08 part-way: holes closed, limits written | Activity 08, step 8 — Gate it, and show it |
| `cp-08` | A headless harness, isolated, restricted and gated; its first run defined the missing design tokens | Activity 09 — Plan → Do as a Pipeline |
| `cp-09a` | Activity 09 part-way: the pipeline built and failing closed; nothing built yet | Activity 09, step 5 — the run on your spec |
| `cp-09` | The harness as a plan → code pipeline, and the read side of Mission Updates built by it from your spec | Activity 10 — The Review Gate |
| `cp-10` | The harness with a review loop (reviewer, fixer, a limit), approval and learnings; posting built by it | End of the workshop |

Activity N produces `cp-N`, so the tag number is always the activity number. The
long Part 3 activities also have lettered rungs part-way through (`cp-08a`,
`cp-08b`, `cp-08c`, `cp-09a`), so falling behind mid-activity costs one jump, not the whole
activity: `./checkpoint.sh 8a`. The team activity between 02 and 03 happens in the
room and produces nothing.

> **`cp-06` is yours alone.** The brand exercise has every attendee invent their
> own identity, so from `cp-06` onward your app looks different from everybody
> else's. Jumping to the published `cp-06` gives you *a* brand so you are not
> stuck — but it will not be the one you wrote. If you want to keep yours, note
> the `wip/` branch name that the jump reports.

`manifest.txt` is the single source of truth for this table — `checkpoint.sh`
reads it, so edit there rather than here.

---

## For facilitators: publishing a checkpoint

A tag on the ladder that doesn't exist yet is reported as *not published*
rather than as an error, so a partially-built ladder stays usable.

Tags are published **in the application repository**, not in this one. Each one
goes through the app's normal review path, so every rung has passed CI:

1. Commit the activity's finished state on a branch and open a PR to `main`.
2. Squash-merge it once CI (including E2E) is green.
3. Tag **the merge commit** on `main` with an annotated tag, and push the tag. From
   a clone of the app (`app/` here is one):

   ```bash
   git -C app fetch origin
   git -C app tag -a cp-05 origin/main -m "Spec written: specs/mission-updates.spec.md"
   git -C app push origin cp-05
   ```

`cp-04` has no PR of its own: it is a second tag on the `cp-03` commit.

Two things to hold to:

- **Tags must be reachable from the default branch**, otherwise a fresh clone
  won't have the history behind them.

  The app's history starts at `cp-01`: it was rewritten on 2026-10-06 so the
  root commit is the baseline, with nothing before it.
- **Never move a published tag mid-workshop.** An attendee who jumped to `cp-05`
  an hour ago and one who jumps now must land on identical code.
