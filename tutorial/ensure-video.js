'use strict';

/**
 * Puts the walkthrough into the application before it is built.
 *
 *   GitHub release `tutorial-latest`  ──▶  Diagnocare-UI/src/assets/tutorial/
 *
 * The video is not committed — it is tens of megabytes and is rebuilt from the
 * recorder — so a fresh checkout has nothing for the player to play, and a
 * deployment built from that checkout shows the "not added yet" note instead of
 * the tutorial. That is what this closes: `npm run ensure:tutorial` before
 * `ng build`, and the deployed app carries the walkthrough without anybody
 * copying a file by hand.
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

const HERE = __dirname;
const ASSETS = path.join(HERE, '..', 'Diagnocare-UI', 'src', 'assets', 'tutorial');

/** The release the tutorial workflow publishes to, moved on each rebuild. */
const TAG = process.env.TUTORIAL_RELEASE_TAG || 'tutorial-latest';

/** The video itself; the rest are small and come with it. */
const VIDEO = 'DiagnoCare-Tutorial.mp4';
/** Everything the player reads. The .m4a is absent unless a Hindi voice was configured. */
const WANTED = [VIDEO, 'tutorial.en.vtt', 'tutorial.hi.vtt', 'tutorial.hi.m4a'];

/** Below this, whatever we have is a stub or a truncated download, not a video. */
const MIN_VIDEO_BYTES = 1024 * 1024;

const REQUIRED = process.env.TUTORIAL_REQUIRED === '1';

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

/** owner/repo, from the Actions environment or from the checkout's own remote. */
function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', cwd: HERE });
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(result.stdout || '');
  return match ? match[1] : null;
}

/** Already there — a developer who ran `npm run all`, or a second build in one job. */
function alreadyInstalled() {
  const file = path.join(ASSETS, VIDEO);
  return fs.existsSync(file) && fs.statSync(file).size >= MIN_VIDEO_BYTES;
}

async function main() {
  if (alreadyInstalled()) {
    note(`${VIDEO} is already in src/assets/tutorial — nothing to fetch.`);
    return;
  }

  const slug = repoSlug();
  if (!slug) giveUp('could not work out which GitHub repository to fetch from.');

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    giveUp(
      'no GITHUB_TOKEN in the environment, and this repository is private. ' +
      'In Actions, pass `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; locally, run ' +
      "`npm run all` in tutorial/ instead.",
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'diagnocare-tutorial-ensure',
  };

  note(`fetching the walkthrough from ${slug} release '${TAG}'…`);

  const release = await fetch(`https://api.github.com/repos/${slug}/releases/tags/${TAG}`, { headers });
  if (!release.ok) {
    await discard(release);
    giveUp(
      `release '${TAG}' answered ${release.status}. ` +
      (release.status === 404
        ? 'Run the "Tutorial video" workflow once to publish it.'
        : 'Check that the token can read releases on this repository.'),
    );
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

    const target = path.join(ASSETS, asset.name);
    fs.writeFileSync(target, Buffer.from(await download.arrayBuffer()));
    note(`  ${asset.name}  ${(fs.statSync(target).size / (1024 * 1024)).toFixed(1)} MB`);
  }

  if (!alreadyInstalled()) giveUp(`${VIDEO} did not arrive intact.`);

  const missing = WANTED.filter(name => !available.some(asset => asset.name === name));
  if (missing.length) note(`not in this release (expected when no Hindi voice is set up): ${missing.join(', ')}`);

  note(`installed into ${ASSETS}`);
}

/**
 * The single place this script decides how it ends.
 *
 * `process.exitCode` rather than `process.exit()`: it lets Node finish closing
 * whatever fetch still has open and then leave of its own accord, which is the
 * difference between the exit code we asked for and a libuv abort. The
 * `::warning::` prefix puts the message on the Actions run summary, so a
 * deployment that shipped without the walkthrough says so where someone will
 * see it rather than only in the log.
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
    `::warning::tutorial: ${why} The app will build with the player's "not added yet" note.\n`,
  );
  process.exitCode = 0;
});
