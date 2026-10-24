import { Directive, ElementRef, Input, OnChanges, OnInit } from '@angular/core';

/**
 * MaskedInputDirective — dot-masked input that browsers never treat as a password.
 *
 * Why this exists
 * ---------------
 * Any `<input type="password">` makes Chrome, Edge, Safari and every third-party
 * password manager offer "Save password?" when the surrounding form is submitted.
 * That is exactly what we want on the Login and Forgot-Password screens, and
 * exactly what we do NOT want on in-app screens — Change Password, Change PIN,
 * the session-unlock PIN prompt, the OTP dialog — where the prompt is noise at
 * best and, for a 4–6 digit PIN, pollutes the user's password vault.
 *
 * `autocomplete="off"` does not fix this: it is the one attribute browsers
 * deliberately ignore on password fields, precisely because sites used to abuse
 * it. The only dependable way to stay out of the save heuristic is to never
 * present a password field at all.
 *
 * So this directive keeps the input as `type="text"` and masks the characters
 * visually with `-webkit-text-security`, which is supported by Chrome, Edge,
 * Safari and Firefox 122+. The value is still masked on screen and still
 * excluded from autofill, but no browser or extension sees a credential.
 *
 * Usage — always masked:
 *   <input type="text" appMasked>
 *
 * Usage — with a show/hide eye toggle (pass the *masked* state, not "show"):
 *   <input type="text" [appMasked]="!showPin">
 *
 * Note for anyone adding auth screens: do NOT use this on the real Login or
 * Forgot-Password fields. Those should stay `type="password"` with proper
 * `autocomplete="current-password"` / `"new-password"` hints so the password
 * manager can save and later update the user's credentials.
 */
@Directive({
  selector: '[appMasked]',
  standalone: true,
})
export class MaskedInputDirective implements OnInit, OnChanges {
  /**
   * Whether the characters are hidden. Defaults to true so a bare `appMasked`
   * (no value) masks the field.
   */
  @Input('appMasked') masked: boolean | '' = true;

  constructor(private el: ElementRef<HTMLInputElement>) {}

  ngOnChanges(): void { this.apply(); }

  ngOnInit(): void {
    // Because the field is now a text input, the browser would otherwise
    // spell-check, auto-capitalise and auto-correct what the user types — all
    // things a real password field suppresses for free.
    const input = this.el.nativeElement;
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    this.apply();
  }

  private apply(): void {
    const input = this.el.nativeElement;

    // Defensive: if someone later sets type="password" on a host using this
    // directive, force it back — otherwise the save prompt returns silently.
    if (input.type === 'password') input.type = 'text';

    // An empty-string input means the attribute was used with no value.
    const isMasked = this.masked === '' || this.masked === true;

    if (isMasked) {
      input.style.setProperty('-webkit-text-security', 'disc');
      input.style.setProperty('text-security', 'disc');
    } else {
      input.style.removeProperty('-webkit-text-security');
      input.style.removeProperty('text-security');
    }
  }
}
