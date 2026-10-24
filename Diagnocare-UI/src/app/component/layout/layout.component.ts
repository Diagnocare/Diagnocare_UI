import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header-menu/header.component';

/** How close the deadline is. Drives colour, icon and wording together. */
type ExpiryTone = 'info' | 'soon' | 'urgent';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, CommonModule, HeaderComponent],
  templateUrl: './layout.component.html',
  styles: [`
    /* Colours chain kit tokens → the app's theme variables → literals, so the
       bar follows all five themes with or without simple-ui.css imported. */
    .pw-notice {
      --pw-radius: 0;

      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "icon text action close";
      align-items: center;
      column-gap: 1rem;
      row-gap: 0.6rem;

      padding: 0.7rem 1.5rem;
      border-bottom: 1px solid transparent;
      border-left: 4px solid transparent;
      font-size: 0.95rem;
      line-height: 1.4;
    }

    /* ── Tone ────────────────────────────────────────────────────────────────
       Three steps rather than one permanent amber. A notice that looks the same
       on day 30 as on day 1 teaches people to ignore it, and then the day-1
       warning does not work either. */
    .pw-notice--info {
      background: var(--dc-info-bg, #e8f0fb);
      border-bottom-color: var(--dc-info-line, #b9d2f2);
      border-left-color: var(--dc-brand, var(--primary-color, #1e5ba8));
      color: var(--dc-info-ink, #1d4ed8);
    }
    .pw-notice--soon {
      background: var(--dc-wait-bg, #fef3c7);
      border-bottom-color: var(--dc-wait-line, #fcd34d);
      border-left-color: #f0ad4e;
      color: var(--dc-wait-ink, #92400e);
    }
    .pw-notice--urgent {
      background: var(--dc-danger-bg, #fee2e2);
      border-bottom-color: var(--dc-danger-line, #fca5a5);
      border-left-color: #b91c1c;
      color: var(--dc-danger-ink, #991b1b);
    }

    /* ── Icon ───────────────────────────────────────────────────────────────
       Its own grid cell, not an inline glyph inside the sentence, so a headline
       that wraps lines up under itself rather than under the icon. */
    .pw-notice__icon {
      grid-area: icon;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.55);
      font-size: 1.05rem;
    }

    /* ── Message ────────────────────────────────────────────────────────────
       Capped at a readable measure. The slack goes between the text and the
       action, which is what makes the bar read as laid out rather than empty. */
    .pw-notice__text {
      grid-area: text;
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: 70ch;
    }
    .pw-notice__headline {
      font-weight: 700;
      font-size: 1rem;
    }
    /* The detail is the part people skip, so it is quieter than the countdown
       rather than the same weight — currentColor at reduced opacity keeps it
       correct in all three tones without three more rules. */
    .pw-notice__detail {
      font-size: 0.85rem;
      opacity: 0.8;
    }

    /* ── Action ─────────────────────────────────────────────────────────────
       A button, not a word in a sentence. The old inline link was the only way
       to act on this notice and it was a 120px text target buried mid-line. */
    .pw-notice__action {
      grid-area: action;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      min-height: 2.5rem;
      padding: 0 1.1rem;
      white-space: nowrap;

      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      color: #fff;
      /* Brand blue is the default so the button is never invisible if a tone
         class is ever missing; each tone overrides it below. */
      background: var(--dc-brand, var(--primary-color, #1e5ba8));
      border-radius: 0.5rem;
      transition: filter 0.15s ease, box-shadow 0.15s ease;
    }
    .pw-notice__action span { color: #fff; }
    .pw-notice__action i { color: #fff; }

    .pw-notice--info   .pw-notice__action { background: var(--dc-brand, var(--primary-color, #1e5ba8)); }
    .pw-notice--soon   .pw-notice__action { background: #b45309; }
    .pw-notice--urgent .pw-notice__action { background: #b91c1c; }

    .pw-notice__action:hover { filter: brightness(1.1); color: #fff; }
    .pw-notice__action:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.25);
    }

    /* ── Close ──────────────────────────────────────────────────────────────
       Deliberately quiet: dismissing is the secondary action here, and it was
       previously the most prominent thing on the right of the bar. */
    .pw-notice__close {
      grid-area: close;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      opacity: 0.55;
      cursor: pointer;
      transition: opacity 0.15s ease, background-color 0.15s ease;
    }
    .pw-notice__close:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.08);
    }
    .pw-notice__close:focus-visible {
      opacity: 1;
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.2);
    }

    /* ── Narrow ─────────────────────────────────────────────────────────────
       The action drops to its own full-width row rather than squeezing the
       message into a column three words wide. Icon, message and close stay on
       the first row so the notice can still be dismissed at a glance. */
    @media (max-width: 48em) {
      .pw-notice {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          "icon text  close"
          "action action action";
        padding: 0.7rem 1rem;
      }
      .pw-notice__action { width: 100%; }
    }

    @media (max-width: 30em) {
      /* Under ~480px the headline alone carries the message; the elaboration
         costs a third of the screen height for something already implied. */
      .pw-notice__detail { display: none; }
      .pw-notice__icon { width: 2rem; height: 2rem; font-size: 0.95rem; }
    }
  `],
})
export class LayoutComponent implements OnInit {
  passwordExpiryDaysLeft: number | null = null;

  ngOnInit(): void {
    const stored = sessionStorage.getItem('passwordExpiryDaysLeft');
    if (stored !== null) {
      this.passwordExpiryDaysLeft = Number(stored);
    }
  }

  /**
   * Three steps, not a single permanent warning. Something that looks identical
   * a month out and a day out gets tuned out, and then it fails on the day it
   * matters.
   */
  get expiryTone(): ExpiryTone {
    const days = this.passwordExpiryDaysLeft;
    if (days === null) return 'info';
    if (days <= 2) return 'urgent';
    if (days <= 7) return 'soon';
    return 'info';
  }

  get expiryIcon(): string {
    switch (this.expiryTone) {
      case 'urgent': return 'fa-exclamation-circle';
      case 'soon':   return 'fa-exclamation-triangle';
      default:       return 'fa-info-circle';
    }
  }

  /**
   * The countdown is the whole message, so it is the headline — not a number
   * buried mid-sentence. "Today" and "tomorrow" beat "in 0 days" and "in 1 day";
   * people read them as time rather than arithmetic.
   */
  get expiryHeadline(): string {
    const days = this.passwordExpiryDaysLeft;
    if (days === null) return '';
    if (days <= 0) return 'Your password expires today';
    if (days === 1) return 'Your password expires tomorrow';
    return `Your password expires in ${days} days`;
  }

  dismissExpiryWarning(): void {
    this.passwordExpiryDaysLeft = null;
    sessionStorage.removeItem('passwordExpiryDaysLeft');
  }
}
