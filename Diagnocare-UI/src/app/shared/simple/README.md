# Simple UI kit

Thirteen standalone Angular components for the screens that lab technicians,
front-desk staff and admins actually use. They exist for one reason: **the
people using Diagnocare are not comfortable with computers, and every screen
should assume that.**

Nothing here replaces the existing design system. `.dc-btn`, `.page-header`,
`app-confirm-modal` and the five themes all keep working — this kit sits on
top and reads the same CSS variables, so a `dc-` component looks right in
default, dark, midnight, warm and system themes with no extra work.

---

## Install

One line at the top of `src/styles.css`:

```css
@import './app/shared/simple/simple-ui.css';
```

That file holds the design tokens (touch sizes, type scale, the five meaning
colours). Every component has fallbacks baked in, so the kit still renders
correctly if you skip this — importing it just lets you retune everything from
one place, and enables the optional large-text mode below.

Then import components per screen, as usual for standalone components:

```ts
import { DcFieldComponent, DcChoiceComponent, DcSaveBarComponent } from '../../shared/simple';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DcFieldComponent, DcChoiceComponent, DcSaveBarComponent],
  …
})
```

---

## The seven rules the kit enforces

These are the rules, not preferences. Every component follows all seven, which
is what makes the app feel like one app instead of twenty-six screens.

1. **Nothing clickable is smaller than 48px.** Below that, a hurried user
   misses. `--dc-touch` is the floor for every button, input and option.
2. **An icon never stands alone.** Every action carries its word. A pencil
   means nothing to someone in their first week, and on a touchscreen the
   tooltip explaining it never appears.
3. **Colour is never the only signal.** Status = colour + icon + word, always
   all three. Roughly one man in twelve cannot separate your red from your green.
4. **A disabled control explains itself.** `blockReason` is not optional
   decoration: a greyed-out Save with no explanation is indistinguishable from
   a frozen app, and that is the single most common support call.
5. **Empty is never blank.** Say what happened, why, and give a button for
   what to do next.
6. **Errors say what to do, not what is wrong.** "Please enter the patient's
   name" beats "patient_Name is required."
7. **The primary action is always visible.** Save sticks to the bottom of the
   viewport rather than sitting at the end of a long scroll.

---

## What each component is for

### `<dc-field>` — one labelled form field

Wraps any control you already use (plain input, `select`, `app-date-picker`,
`ng-select`) and adds a large label above it, a hint before it, a "Required"
badge, a 48px-tall box, and the error underneath in plain language.

```html
<dc-field label="Patient name"
          hint="As written on the ID proof"
          [control]="form.get('patient_Name')"
          [submitted]="submitted">
  <input class="form-control" formControlName="patient_Name" placeholder="e.g. Ramesh Kumar">
</dc-field>
```

It reads error messages from the existing `validation-messages.ts`, so wording
stays in one place. **Worth doing while you are here:** soften the shared
messages themselves — `required: (l) => \`${l} is required.\`` reads like a
database, whereas `` (l) => `Please enter the ${l.toLowerCase()}.` `` reads
like a person. One edit, every field in the app improves.

### `<dc-choice>` — big cards instead of a dropdown

For 2–6 fixed options: gender, urgency, payment mode, report format. A
`<select>` hides its options, needs two precise clicks, and renders a
mis-clickably small list on Windows. Cards show everything at once.

```html
<dc-field label="Report urgency" [control]="form.get('isUrgent')">
  <dc-choice formControlName="isUrgent" [options]="urgencyOptions"></dc-choice>
</dc-field>
```

```ts
urgencyOptions: DcChoiceOption[] = [
  { value: 'Yes', label: 'Urgent', icon: 'fa-bolt',  hint: 'Report today' },
  { value: 'No',  label: 'Normal', icon: 'fa-clock-o', hint: 'Standard turnaround' },
];
// or, for a plain yes/no:  urgencyOptions = yesNoOptions('Urgent', 'Normal', 'Yes', 'No');
```

Arrow keys move between options, exactly like native radios. **Do not use it
for long lists** — for tests, doctors or areas, keep `ng-select` with search.

### `<dc-number>` — number box with big − and + buttons

For discounts, quantities, ages, amounts. The native spinner arrows are ~10px
tall and vanish on mobile; these are 48px. Values clamp to `min`/`max` on blur,
so an out-of-range number cannot be entered at all — no error message needed.

```html
<dc-field label="Discount" hint="Maximum allowed is 20%">
  <dc-number formControlName="discount" suffix="%" [min]="0" [max]="20" [step]="5"></dc-number>
</dc-field>
```

### `<dc-search>` — one search box that behaves the same everywhere

Enter searches. The Search button searches. Clear (×) empties the box *and
re-runs the search*, so the full list comes back — leaving a list filtered
after the box looks empty is a top source of "the app is stuck". Pass
`resultCount` to get a plain-language count, including a useful zero state.

```html
<dc-search [(value)]="searchTerm"
           label="Find a patient"
           placeholder="Type a name or patient ID"
           [resultCount]="filteredPatients.length"
           resultNoun="patient"
           (search)="searchPatients()">
</dc-search>
```

### `<dc-task-tile>` — home-screen task buttons

Big tiles naming tasks in the user's words, with an optional count badge so an
operator sees there is work waiting before clicking. Put them in a
`.dc-task-grid`.

```html
<div class="dc-task-grid">
  <dc-task-tile icon="fa-user-plus" label="Register a patient"
                hint="Add a new patient and book their tests"
                routerLink="/add-patient" [accent]="true"></dc-task-tile>

  <dc-task-tile icon="fa-flask" label="Enter test results"
                hint="Fill in results for booked tests"
                [badge]="pendingCount" badgeLabel="waiting"
                routerLink="/patient-test-list"></dc-task-tile>
</div>
```

Use `accent` on at most one tile per screen. If everything is highlighted,
nothing is.

### `<dc-wizard>` — a long form, one step at a time

Registration is currently one very long form; an unsure user gets lost, misses
a required field halfway down, presses Save and gets a wall of red. Three or
four short steps fix all of that. You keep your existing `FormGroup` — the
wizard only owns the progress rail and the Back/Next/Finish buttons.

```html
<dc-wizard [steps]="steps" [(index)]="stepIndex"
           [canContinue]="isStepValid(stepIndex)"
           [blockReason]="stepBlockReason"
           finishLabel="Register patient"
           [busy]="saving"
           (finish)="save()">

  <ng-container *ngIf="stepIndex === 0">…patient fields…</ng-container>
  <ng-container *ngIf="stepIndex === 1">…test selection…</ng-container>
  <ng-container *ngIf="stepIndex === 2">
    <dc-summary title="Please check these details" [rows]="reviewRows" (edit)="stepIndex = 0"></dc-summary>
  </ng-container>
</dc-wizard>
```

```ts
steps: DcWizardStep[] = [
  { title: 'Who is the patient?', hint: 'Name, age and contact number.' },
  { title: 'Which tests?',        hint: 'Pick every test being done today.' },
  { title: 'Check and confirm',   hint: 'Read this back before saving.' },
];
```

Name steps after the question they answer, not after the data model:
"Who is the patient?" beats "Demographics".

### `<dc-summary>` — the review step

Reads the entered values back as label/value lines. Blank values are shown in
red as "Not entered" rather than hidden, because a missing value nobody can
see is a missing value nobody fixes. Also useful inside a confirmation dialog
before anything irreversible.

### `<dc-status>` — status as colour + icon + word

One shared table maps every status string in the app (`Pending`, `Partial`,
`Completed`, `Cancelled`, `Deactivated`, `Approved`, `Absent`…) to a tone and
a glyph, so "Pending" is the same amber clock on every screen. Unknown values
fall back to a neutral grey pill — never to an unlabelled colour.

```html
<dc-status [status]="patient.status"></dc-status>
```

### `<dc-action>` — a row action that says what it does

Drop-in replacement for the icon-only `<app-action-btn>`. Same icons, plus the
word. Swap the tag and keep the handler:

```html
<!-- before -->
<app-action-btn type="edit" title="Edit Patient" (clicked)="editPatient(id)"></app-action-btn>
<!-- after -->
<dc-action type="edit" (clicked)="editPatient(id)"></dc-action>
```

`[compact]="true"` collapses to icon-only **below 768px only**, and keeps the
accessible name either way. Destructive actions stay red, say "Delete", and
should still go through `ConfirmModalService` — three chances to notice.

### `<dc-record>` — a list row that survives a narrow screen

The patient table is nine columns with icon-only buttons at the right edge; on
a tablet it scrolls sideways and the buttons disappear. A record card puts the
same data in reading order and keeps the actions attached to the record.

Keep the table for power users doing bulk work — it is faster to scan. Offer
cards as the default and let both read the same data.

### `<dc-empty>` — what to show when there is nothing

Answers three questions in order — what happened, why, and what to press next
— and gives the last one as a real button.

```html
<dc-empty icon="fa-search"
          title="No patients match that search"
          message="Check the spelling, or try just the first few letters of the name."
          actionLabel="Show all patients"
          (action)="clearSearch()">
</dc-empty>
```

Use `tone="danger"` for load failures; an error is an empty state too, and it
still needs a "Try again" button.

### `<dc-note>` — the rule, where the rule applies

Rules that live only in someone's head cause the same support call every week.
Put the answer next to the control it governs, before the user hits the wall.

```html
<dc-note tone="warn" title="Maximum discount is 20%">
  Anything higher needs a Super Admin to authorise it.
</dc-note>
```

Four tones, chosen by consequence: `info` (fact), `tip` (makes them faster),
`warn` (prevents a mistake), `danger` (irreversible).

### `<dc-save-bar>` — Save, always visible, always explained

Sticks to the bottom of the viewport. Shows unsaved-changes state, and when
Save is disabled it says why in one sentence.

```html
<dc-save-bar [canSave]="form.valid"
             blockReason="Patient name and age are still empty."
             saveLabel="Save patient"
             [busy]="saving"
             [dirty]="form.dirty"
             (save)="onSave()"
             (cancel)="goBack()">
</dc-save-bar>
```

---

## Optional: large-text mode

Set `data-dc-size="large"` on `<html>` from the existing Settings screen and
every component in the kit grows together — targets, labels, buttons — because
they all measure themselves in the same tokens. Nothing outside the kit is
affected.

```ts
document.documentElement.setAttribute('data-dc-size', 'large');   // or remove it
```

Worth offering next to the theme picker. Several of the people using this app
all day will want it, and none of them will ask.

---

## Where to start

Rolling the whole kit out at once is a large diff and a big retraining event.
This order gets most of the benefit early, and each step is independently
shippable:

1. **`dc-action` on the patient list.** One tag swap, and the three mystery
   grey squares become labelled buttons. Smallest change, most noticed.
2. **`dc-status` everywhere a status renders.** Removes the per-screen
   `getStatusClass()` helpers and makes the colours mean the same thing.
3. **`dc-empty` on every list.** Cheap, and it kills a whole class of "the
   screen is blank, is it broken?" calls.
4. **`dc-save-bar` on the long forms** — add-patient, staff, lab-setup.
5. **`dc-field` + `dc-choice` on add-patient**, then wrap it in `dc-wizard`
   with a `dc-summary` review step. This is the big one; do it last, when the
   smaller pieces have already proved themselves.

Watch a technician use the result before rolling it out further. The point of
the kit is that it makes that observation cheap to act on — most fixes are a
prop, not a rewrite.
