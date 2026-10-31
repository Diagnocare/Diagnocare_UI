'use strict';

/**
 * Puts the walkthrough into the application before it is built.
 *
 *   GitHub release `tutorial-latest`  ──▶  Diagnocare-UI/src/assets/tutorial/
 *
 * The video is not committed — it is tens of megabytes and is rebuilt from the
 * recorder — so a fresh checkout has nothing for the player to play, and a
 * deployment built from that checkout shows the "not added yet" note instead of
 * the tutorial. That is what this closes.
 *
 * WHY A RELEASE ASSET AND NOT A BUILD STEP
 * ────────────────────────────────────────
 * Recording the walkthrough means driving the real UI through fifteen minutes of
 * playback and then encoding it — half an hour, a Playwright browser download
 * and a gigabyte of scratch space. Doing that on every deployment would make
 * every deployment half an hour slower and give a flaky screen recording the
 * power to block a release. So it is built by its own workflow when `tutorial/`
 * changes, published once, and merely *fetched* here.
 *
 * WHY IT LIVES IN Diagnocare-UI/tools/ AND NOT IN tutorial/
 * ─────────────────────────────────────────────────────────
 * Because UAT and production are built by Vercel, whose Root Directory is
 * Diagnocare-UI. Vercel does not put anything above the root directory into the
 * build container unless "Include source files outside of the Root Directory"
 * is switched on, so a fetch script in a sibling folder is a script that is not
 * there when the build runs. Keeping it under the root directory means the
 * Vercel build needs no setting changed to find it.
 *
 * IT DOES NOT FAIL THE BUILD
 * ──────────────────────────
 * A missing walkthrough is a missing nice-to-have; a blocked deployment is an
 * outage. So every failure here is a warning and exit 0, and the player falls
 * back to the note it already shows. Set TUTORIAL_REQUIRED=1 to make it fatal
 * instead — worth doing for the environments where the tutorial is part of what
 * is being signed off.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const HERE = __dirname;
const ASSETS = path.join(HERE, '..', 'src', 'assets', 'tutorial');

/**
 * Called from `postinstall` rather than by a person.
 *
 * In that mode this does nothing unless it is a Vercel build. `npm install` is
 * the only hook Vercel runs that does not depend on which build command a
 * project happens to have configured, so postinstall is how the fetch reaches
 * UAT and production — but that is no reason for `npm install` on a laptop to
 * reach for the network and a 53 MB download nobody asked for.
 */
const INSTALL_HOOK = process.argv.includes('--install-hook');

/** The release the tutorial workflow publishes to, moved on each rebuild. */
const TAG = process.env.TUTORIAL_RELEASE_TAG || 'tutorial-latest';

/** The video itself; the rest are small and come with it. */
const VIDEO = 'DiagnoCare-Tutorial.mp4';
/** Everything the player reads. The .m4a is absent unless a Hindi voice was configured. */
const WANTED = [VIDEO, 'tutorial.en.vtt', 'tutorial.hi.vtt', 'tutorial.hi.m4a'];

/** Below this, whatever we have is a stub or a truncated download, not a video. */
const MIN_VIDEO_BYTES = 1024 * 1024;

/**
 * Where to fetch from when nothing in the environment says.
 *
 * Vercel clones the repository, so `git remote` usually answers — but a build
 * container is free to arrange its checkout however it likes, and a walkthrough
 * that silently stops being deployed because `git` moved is worse than a name
 * written down. The repository is public, so this is not a secret.
 */
const DEFAULT_REPO = 'Diagnocare/Diagnocare_UI';

const REQUIRED = process.env.TUTORIAL_REQUIRED === '1';

/** `::warning::` is an Actions annotation; anywhere else it is just noise. */
const WARN_PREFIX = process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : '';

/**
 * Thrown to unwind out of the fetch and land in the one handler at the bottom.
 *
 * It is a throw and not a `process.exit()` on purpose. Calling exit() from
 * inside an await, while fetch still holds a keep-alive socket, aborts the
 * process on a libuv assertion — `!(handle->flags & UV_HANDLE_CLOSING)` — and
 * the exit code comes out 127 rather than the 0 that was asked for. A step
 * written specifically so it could never fail the build then fails the build.
 */
class GiveUp extends Error {}

function giveUp(message) {
  throw new GiveUp(message);
}

function note(messageText) {
  process.stdout.write(`tutorial: ${messageText}\n`);
}

/**
 * A response we are not going to read. Its body is released rather than left
 * dangling, so the socket closes and the process can end on its own.
 */
async function discard(response) {
  try {
    await response.body?.cancel();
  } catch {
    /* Already consumed or already closed. */
  }
}

/** owner/repo — from the environment the build gives us, or from the checkout. */
function repoSlug() {
  if (process.env.TUTORIAL_REPO) return process.env.TUTORIAL_REPO;

  // GitHub Actions.
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  // Vercel: set for every git-linked deployment, UAT and production alike.
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (owner && repo) return `${owner}/${repo}`;

  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', cwd: HERE });
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(result.stdout || '');
  return match ? match[1] : DEFAULT_REPO;
}

/** Already there — a developer who ran `npm run all`, or a second build in one job. */
function alreadyInstalled() {
  const file = path.join(ASSETS, VIDEO);
  return fs.existsSync(file) && fs.statSync(file).size >= MIN_VIDEO_BYTES;
}

/** The advice that fits the status GitHub answered the release lookup with. */
function adviceFor(status) {
  if (status === 404) return 'Run the "Tutorial video" workflow once to publish it.';
  if (status === 403) {
    return 'That is usually GitHub rate-limiting an anonymous call; set TUTORIAL_TOKEN to raise the limit.';
  }
  return 'Check that this repository and release are readable.';
}

async function main() {
  if (INSTALL_HOOK && !process.env.VERCEL) return;

  if (alreadyInstalled()) {
    note(`${VIDEO} is already in src/assets/tutorial — nothing to fetch.`);
    return;
  }

  const slug = repoSlug();

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'diagnocare-tutorial-ensure',
  };

  // The repository is public, so no credential is needed and Vercel needs no
  // secret configured for this to work. One is used when the environment
  // happens to carry it, because an authenticated call gets a far larger share
  // of GitHub's rate limit than a build container's shared IP does.
  const token = process.env.TUTORIAL_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  note(`fetching the walkthrough from ${slug} release '${TAG}'${token ? '' : ' (anonymously)'}…`);

  const release = await fetch(`https://api.github.com/repos/${slug}/releases/tags/${TAG}`, { headers });
  if (!release.ok) {
    await discard(release);
    giveUp(`release '${TAG}' answered ${release.status}. ${adviceFor(release.status)}`);
  }

  const assets = (await release.json()).assets || [];
  const available = assets.filter(asset => WANTED.includes(asset.name));
  if (!available.some(asset => asset.name === VIDEO)) {
    giveUp(`release '${TAG}' has no ${VIDEO} attached.`);
  }

  fs.mkdirSync(ASSETS, { recursive: true });

  for (const asset of available) {
    // `Accept: octet-stream` against the asset's API url is what returns the
    // bytes; the browser_download_url needs a session cookie on a private repo.
    const download = await fetch(asset.url, {
      headers: { ...headers, Accept: 'application/octet-stream' },
    });
    if (!download.ok) {
      await discard(download);
      giveUp(`downloading ${asset.name} answered ${download.status}.`);
    }

    // Streamed through a .part file and renamed, so an interrupted download
    // leaves nothing behind that looks like a video. Streaming also keeps the
    // whole 53 MB out of the heap, which matters rather more in a build
    // container than it does on a workstation.
    const target = path.join(ASSETS, asset.name);
    const partial = `${target}.part`;
    try {
      await pipeline(Readable.fromWeb(download.body), fs.createWriteStream(partial));
    } catch (err) {
      fs.rmSync(partial, { force: true });
      giveUp(`downloading ${asset.name} broke off: ${err.message}.`);
    }
    fs.renameSync(partial, target);
    note(`  ${asset.name}  ${(fs.statSync(target).size / (1024 * 1024)).toFixed(1)} MB`);
  }

  if (!alreadyInstalled()) giveUp(`${VIDEO} did not arrive intact.`);

  const missing = WANTED.filter(name => !available.some(asset => asset.name === name));
  if (missing.length) {
    note(`not in this release (expected when no Hindi voice is set up): ${missing.join(', ')}`);
  }

  note(`installed into ${ASSETS}`);
}

/**
 * The single place this script decides how it ends.
 *
 * `process.exitCode` rather than `process.exit()`: it lets Node finish closing
 * whatever fetch still has open and then leave of its own accord, which is the
 * difference between the exit code we asked for and a libuv abort.
 */
main().catch(err => {
  const why = err instanceof GiveUp ? err.message : `${err.message}.`;
  if (REQUIRED) {
    process.stderr.write(`tutorial: ${why}\n`);
    process.stderr.write('tutorial: TUTORIAL_REQUIRED=1, so this is fatal.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${WARN_PREFIX}tutorial: ${why} The app will build with the player's "not added yet" note.\n`,
  );
  process.exitCode = 0;
});
