import { Directive } from '@angular/core';

/**
 * AutocompleteInputDirective
 * Shared directive used by patient add/edit forms as a selector anchor.
 * Autocomplete behaviour (show/hide suggestions, filtering) is handled
 * inline in each host component.
 */
@Directive({
  selector: '[appAutocompleteInput]',
  standalone: true
})
export class AutocompleteInputDirective {}
