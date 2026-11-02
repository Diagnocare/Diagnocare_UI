'use strict';

/**
 * The verbs the tutorial script is written in.
 *
 * Two things make the output read as a walkthrough rather than a test run:
 *
 *  1. The pointer travels. Every click moves the mouse from wherever it already is to the
 *     target along an eased path, so it is always visible on its way — Playwright's
 *     default is an instant jump that reads as a glitch on video.
 *  2. Narration sets the pace. say() holds for as long as the line takes to read aloud,
 *     and records the interval it occupied, so the subtitles are built from the timings
 *     the video actually has instead of estimates.
 *
 * Every narration beat is bilingual: say(en, hi) shows both on screen and records both
 * against the one interval, which is what lets a single pass produce an English and a
 * Hindi subtitle track that are frame-identical in timing.
 *
 * The hold is computed from the English line but given a floor derived from the Hindi
 * one, because the two are rarely the same length and the slower of the pair is the one
 * a viewer has to be able to finish reading.
 */

/** Reading speed for narration, in words per minute. */
const WORDS_PER_MINUTE = 150;
/**
 * Hindi is read more slowly than English here, both because Devanagari is denser to scan
 * and because a viewer reading the second line has already spent time on the first.
 */
const DEVANAGARI_WPM = 115;
/** Floor for a short line, so "Let's begin." still gets a beat. */
const MIN_LINE_MS = 1900;
/** Breath between narration lines. */
const INTER_LINE_MS = 420;

function narrationDurationMs(text, wpm = WORDS_PER_MINUTE) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_LINE_MS, Math.round((words / wpm) * 60000));
}

/** Ease-in-out: slow at both ends, which is what makes the travel look deliberate. */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

class Driver {
  constructor(page, timeline, opts = {}) {
    this.page = page;
    this.timeline = timeline;
    this.speed = opts.speed || 1;
    this.pointer = { x: 960, y: 620 };
    this.section = null;
  }

  ms(duration) {
    return Math.max(1, Math.round(duration / this.speed));
  }

  async wait(duration) {
    await this.page.waitForTimeout(this.ms(duration));
  }

  /** Marks a new chapter in the timeline, for the subtitle and chapter files. */
  startSection(id, title) {
    this.section = { id, title };
  }

  /**
   * One narration beat in English and Hindi: holds the picture for the longer of the
   * two reading times, and records the interval so both subtitle tracks line up with
   * the finished video.
   *
   * Nothing is drawn. The text reaches the viewer as the .vtt tracks the player lets
   * them choose between — see the note at the top of overlay.js — so this method's
   * only job is to decide how long the step is given and to write down when it ran.
   */
  async say(en, hi, { hold = 0 } = {}) {
    const startedAt = Date.now() - this.timeline.t0;

    const duration = this.ms(
      Math.max(narrationDurationMs(en), narrationDurationMs(hi, DEVANAGARI_WPM)) + hold,
    );
    await this.page.waitForTimeout(duration);

    this.timeline.lines.push({
      section: this.section?.id ?? null,
      sectionTitle: this.section?.title ?? null,
      en,
      hi: hi || '',
      startMs: startedAt,
      endMs: startedAt + duration,
    });

    await this.page.waitForTimeout(this.ms(INTER_LINE_MS));
  }

  /** A full-screen chapter card. Also recorded, so chapters land in the subtitle file. */
  async titleCard({ kicker, title, titleHi, subtitle, subtitleHi, narration = [], hold = 900 }) {
    await this.page.evaluate(
      o => window.__tutorialCard?.(o),
      { kicker, title, titleHi, subtitle, subtitleHi },
    ).catch(() => {});
    await this.wait(820);
    // narration is a list of [english, hindi] pairs.
    for (const [en, hi] of narration) await this.say(en, hi);
    await this.wait(hold);
    await this.page.evaluate(() => window.__tutorialCard?.(null)).catch(() => {});
    await this.wait(680);
  }

  /** Moves the pointer along an eased path. Never jumps. */
  async moveTo(x, y, { duration = 760 } = {}) {
    const from = { ...this.pointer };
    const dx = x - from.x, dy = y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) { this.pointer = { x, y }; return; }

    // Longer trips get more frames, but the count is capped so a long move does not
    // turn into hundreds of CDP round-trips.
    const frames = Math.max(14, Math.min(46, Math.round(distance / 22)));
    const total = this.ms(duration);

    for (let i = 1; i <= frames; i++) {
      const p = easeInOut(i / frames);
      // A slight arc: a perfectly straight line is the one thing a hand never draws.
      const arc = Math.sin((i / frames) * Math.PI) * Math.min(26, distance * 0.07);
      await this.page.mouse.move(from.x + dx * p, from.y + dy * p - arc);
      await this.page.waitForTimeout(Math.max(4, Math.round(total / frames)));
    }
    await this.page.mouse.move(x, y);
    this.pointer = { x, y };
  }

  async centerOf(locator) {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(this.ms(220));
    const box = await locator.boundingBox();
    if (!box) throw new Error('target has no bounding box');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  }

  /** Travel to an element, pause as a person does before committing, then click. */
  async click(locator, { settle = 900, pulse = true } = {}) {
    const { x, y } = await this.centerOf(locator);
    await this.moveTo(x, y);
    await this.wait(260);
    if (pulse) await this.page.evaluate(([cx, cy]) => window.__tutorialClickPulse?.(cx, cy), [x, y]).catch(() => {});
    await locator.click({ timeout: 15000 });
    await this.wait(settle);
  }

  /** Types at a human cadence rather than setting the value in one frame. */
  async type(locator, text, { settle = 560, delay = 72 } = {}) {
    await this.click(locator, { settle: 170 });
    await locator.fill('');
    await locator.type(text, { delay: Math.round(delay / this.speed) });
    await this.wait(settle);
  }

  async select(locator, value, { settle = 620 } = {}) {
    const { x, y } = await this.centerOf(locator);
    await this.moveTo(x, y);
    await this.wait(200);
    await this.page.evaluate(([cx, cy]) => window.__tutorialClickPulse?.(cx, cy), [x, y]).catch(() => {});
    await locator.selectOption(value);
    await this.wait(settle);
  }

  /** Dims everything but one element. The "zoom/focus" beat between explanations. */
  async focusOn(locator, { hold = 0 } = {}) {
    const { box } = await this.centerOf(locator);
    await this.page.evaluate(
      r => window.__tutorialSpotlight?.(r),
      { x: box.x, y: box.y, width: box.width, height: box.height },
    ).catch(() => {});
    await this.wait(520 + hold);
  }

  async clearFocus() {
    await this.page.evaluate(() => window.__tutorialSpotlight?.(null)).catch(() => {});
    await this.wait(420);
  }

  /**
   * Clicks a link in the sidebar, opening its section first if it is folded.
   *
   * This is the sidebar shell (USE_SIDEBAR_SHELL in simple-ui.flags.ts), not the
   * old header: there are no hover dropdowns to dwell on. Sections are
   * click-to-fold disclosures and most of them start open, so the section
   * heading is only pressed when the link is not already on screen — pressing
   * it unconditionally would *close* an open section and the link would vanish.
   *
   * `label` has to match the whole label, not a substring: "Patients" is also
   * inside "Patient Register", "Patient History Wise" and four other report
   * names, and a substring match picks whichever happens to come first.
   */
  async navigate(sectionTitle, label) {
    const exact = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    const link = this.page
      .locator('.sh-nav-item .sh-nav-label, .sh-subnav-item .sh-nav-label')
      .filter({ hasText: exact })
      .first();

    if (!(await link.isVisible().catch(() => false))) {
      const heading = this.page.locator('.sh-nav-title').filter({ hasText: sectionTitle }).first();
      await this.click(heading, { settle: 760 });
      await link.waitFor({ state: 'visible', timeout: 10000 });
    }

    // The label is a <span> inside the <a>; the click bubbles to the link.
    await this.click(link, { settle: 2200 });
  }

  async scrollBy(dy, { duration = 900 } = {}) {
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps);
      await this.page.waitForTimeout(Math.round(this.ms(duration) / steps));
    }
    await this.wait(380);
  }
}

module.exports = { Driver, narrationDurationMs, WORDS_PER_MINUTE, DEVANAGARI_WPM };
