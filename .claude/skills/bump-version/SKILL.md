---
name: bump-version
description: >
  Bump the extension version for summarize-ai, sync package.json and
  public/manifest.json, package the zip, tag, and cut a GitHub release with
  the zip attached. Use when the user wants to bump/release the version, cut
  a release, or ship a new version to the Chrome Web Store / GitHub.
---

# Bump Version

This repo has **two** version sources that must stay in sync (there is no
changesets tooling here — bumps are manual):

- `package.json` — Node package version.
- `public/manifest.json` — the shipped Chrome-extension version (this is what
  Chrome and the Web Store actually read). Copied into `dist/manifest.json`
  at build time.

There is no `CHANGELOG.md` in this repo; release notes are generated from
`git log` since the previous tag.

## Step 1: Assess current state

```bash
grep '"version"' package.json public/manifest.json
git tag --sort=-v:refname | head -3
```

Confirm both files currently match (they should — if they don't, that's
pre-existing drift, report it before proceeding rather than silently fixing
it into your bump). Note the latest tag, if any (`vX.Y.Z` convention) — the
release notes in Step 6 are the commits since that tag.

## Step 2: Determine the new version

- If the user gave an explicit version or a bump keyword (`patch` / `minor` /
  `major`) in their request, use that.
- Otherwise, ask (AskUserQuestion or a direct question) — there's no
  changeset trail to infer the bump type from, so guess conservatively
  (usually `patch`) only if the user clearly just wants "bump it" with no
  other signal, and confirm before tagging.

Compute `NEW_VERSION` via normal semver rules from the current version.

## Step 3: Bump both files

Edit the `"version"` field in both `package.json` and `public/manifest.json`
to `NEW_VERSION`. Keep every other field untouched.

## Step 4: Verify and package

```bash
npm run package
```

This runs typecheck → tests → the two-stage build (content script + popup)
→ `web-ext build`, producing `release/summarize_ai_buddy-<NEW_VERSION>.zip`.
If any step fails, stop and fix it — do not tag or release a broken build.
(`release/` is gitignored; the zip is attached to the GitHub release in
Step 6, never committed.)

## Step 5: Commit and tag

```bash
git add package.json package-lock.json public/manifest.json
git commit -m "chore(release): bump version to <NEW_VERSION>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git tag v<NEW_VERSION>
```

Only include `package-lock.json` in the `git add` if it actually changed
(a plain version bump normally doesn't touch it — check `git status` first).

## Step 6: Push and create the GitHub release

Pushing a tag and publishing a release are visible, hard-to-reverse actions —
confirm with the user before this step if they only asked to "bump the
version" rather than explicitly to "release" or "ship" it.

```bash
git push origin main
git push origin v<NEW_VERSION>

# Release notes: commit subjects since the previous tag (first release → full log)
PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
if [ -n "$PREV_TAG" ]; then
  git log "${PREV_TAG}..HEAD^" --pretty='- %s' > /tmp/release-notes-<NEW_VERSION>.md
else
  git log --pretty='- %s' > /tmp/release-notes-<NEW_VERSION>.md
fi

gh release create "v<NEW_VERSION>" \
  --title "v<NEW_VERSION>" \
  --notes-file "/tmp/release-notes-<NEW_VERSION>.md" \
  "release/summarize_ai_buddy-<NEW_VERSION>.zip"
```

If a release for the tag already exists, don't error — use
`gh release upload v<NEW_VERSION> release/summarize_ai_buddy-<NEW_VERSION>.zip --clobber`
to refresh the attached zip instead.

## Step 7: Report

Summarize: old → new version, the packaged zip's path and size, the tag, and
the release URL. Remind the user that shipping to the actual Chrome Web
Store still requires manually uploading the zip at the
[developer dashboard](https://chrome.google.com/webstore/devconsole) — this
skill prepares and publishes the artifact but does not submit it there.

## Manual-only bump (no tag / release yet)

If the user just wants the version bumped locally without tagging or
releasing (e.g. mid-development), stop after Step 3 (or Step 4 if they also
want the zip built) and skip tagging/pushing/releasing entirely.
