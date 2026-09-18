/**
 * AutofillGuard — stops Chrome pre-filling every text box with the saved login user id.
 *
 * Why this is needed
 * ──────────────────
 * Almost every input in the app is a reactive-forms input written as
 *
 *     <input class="form-control" formControlName="contactPerson" />
 *
 * `formControlName` is an Angular binding, not an HTML attribute, so to the
 * browser these fields have **no `name`, no `id` and no `autocomplete`**.
 * Chrome builds its autofill signature from exactly those attributes, so every
 * such field hashes to the same "unnamed single-line text field" signature as
 * the login screen's user-name box (which is marked `autocomplete="username"`).
 * Result: the stored user id is offered — and often silently filled — into
 * every text box on every page. `autocomplete="off"` on the <form> alone does
 * not help; Chrome ignores it whenever its heuristics still recognise a field.
 *
 * What this does
 * ──────────────
 * Watches the DOM and, for every input/textarea Angular renders, stamps:
 *   • `autocomplete="off"` (or `new-password` for password boxes), and
 *   • a unique, per-page-load random `name`, so no two fields — and no field
 *     across two page loads — share an autofill signature.
 * Password managers are told to stay out via `data-lpignore` / `data-form-type`.
 *
 * Fields that declare `autocomplete` in their template are left completely
 * untouched, so the login form keeps `username` / `current-password` and Chrome
 * can still offer to save and fill the actual credentials there.
 *
 * Installed once from main.ts — no template changes required.
 */

/** Input types that carry no free text and are never autofilled. */
const IGNORED_INPUT_TYPES = new Set([
  'hidden', 'checkbox', 'radio', 'submit', 'button',
  'reset', 'file', 'range', 'color', 'image',
]);

/** Marks elements already processed so the observer never re-stamps them. */
const STAMP = 'dcAutofillGuard';

/** Fresh per page load: guarantees the signature changes between sessions. */
const SALT = Math.random().toString(36).slice(2, 8);
let counter = 0;

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(el: Element): el is TextField {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

function guardField(el: TextField): void {
  if (el.dataset[STAMP]) {
    return;
  }

  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (el.tagName === 'INPUT' && IGNORED_INPUT_TYPES.has(type)) {
    el.dataset[STAMP] = '1';
    return;
  }

  // The template asked for a specific autocomplete behaviour (login, MFA code,
  // deliberate browser assistance). Respect it and leave the field alone.
  if (el.hasAttribute('autocomplete')) {
    el.dataset[STAMP] = '1';
    return;
  }

  el.setAttribute('autocomplete', type === 'password' ? 'new-password' : 'off');

  if (!el.getAttribute('name')) {
    const base =
      el.getAttribute('formcontrolname') || el.getAttribute('id') || 'field';
    el.setAttribute('name', `dc-${base}-${SALT}${++counter}`);
  }

  // Third-party password managers (LastPass, Dashlane, 1Password).
  el.setAttribute('data-lpignore', 'true');
  el.setAttribute('data-form-type', 'other');

  el.dataset[STAMP] = '1';
}

function guardTree(root: Document | Element): void {
  if (root.nodeType === Node.ELEMENT_NODE && isTextField(root as Element)) {
    guardField(root as TextField);
  }
  root.querySelectorAll('input, textarea').forEach((el) => {
    guardField(el as TextField);
  });
}

let installed = false;

/**
 * Starts the guard. Safe to call more than once; only the first call installs.
 */
export function installAutofillGuard(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;

  guardTree(document);

  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          guardTree(node as Element);
        }
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
