# Seeing the kit running, without changing the app

Two ways. The first changes no application code at all and cannot leak into a
release; the second is faster to set up but edits a file that matters.

---

## Option A — its own dev server (recommended)

The preview gets its own Angular project entry, its own entry file, its own
index.html and its own port. It compiles the same component source under the
same strict settings as the app, but the app's build never loads any of it, and
nothing in `src/app/component/`, `src/app-routing.module.ts` or `src/main.ts`
is touched.

**Step 1.** Paste this block into `angular.json`, immediately after the closing
brace of the `"diagnocareUI-app"` project — that is, inside `"projects"`, as a
sibling. Nothing already in the file changes; you are only adding a key.

```jsonc
    "ui-kit": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:browser",
          "options": {
            "outputPath": "dist/ui-kit",
            "index": "src/app/shared/simple/showcase/ui-kit.index.html",
            "main": "src/app/shared/simple/showcase/ui-kit.main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.ui-kit.json",
            "assets": ["src/favicon.ico"],
            "styles": [
              "node_modules/@fortawesome/fontawesome-free/css/v4-shims.min.css",
              "src/styles.css"
            ],
            "scripts": [],
            "optimization": false,
            "sourceMap": true,
            "namedChunks": true
          }
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "options": {
            "buildTarget": "ui-kit:build",
            "port": 4300
          }
        }
      }
    }
```

Don't forget the comma after the `diagnocareUI-app` block's closing brace.

**Step 2.** Run it:

```bash
ng serve ui-kit
```

Open <http://localhost:4300>. No login, no API, no database — the page holds its
own sample patients. `ng serve` for the real app still works exactly as before,
on its own port, and the two can run side by side.

**Optional**, if you'd rather type `npm run ui-kit`, add to `package.json`
scripts:

```json
"ui-kit": "ng serve ui-kit"
```

### Why this needs `src/styles.css`

The kit reads the app's existing CSS variables — `--primary-color`,
`--bg-white`, `--border-color` and the rest — which is how it inherits all five
themes for free. Loading the app's real stylesheet is what makes the preview
truthful: what you see at :4300 is what you will get inside the app.

The showcase page pulls in `simple-ui.css` itself, so you do **not** need to add
the `@import` line to `styles.css` to try the kit. Add that later, when you
start using components on real screens.

---

## Option B — one route inside the real app

Faster, and it shows the kit inside the actual header and layout. The cost is
that it edits `app-routing.module.ts`, so it can be forgotten and shipped.

Add this next to the other public routes in `app-routing.module.ts` — above the
authenticated `LayoutComponent` block, so it needs no login:

```ts
  // TEMPORARY — UI kit preview. Delete before release.
  { path: 'ui-kit', title: 'UI Kit',
    loadComponent: () => import('./shared/simple/showcase/simple-ui-showcase.component')
      .then(m => m.SimpleUiShowcaseComponent) },
```

Then `ng serve` and open <http://localhost:4200/#/ui-kit>.

It is lazy-loaded, so it adds nothing to the initial bundle until someone visits
it. If you'd rather keep it permanently, move it inside the authenticated block
and add `canActivate: [roleGuard(Role.Super_Admin.id)]` — it is genuinely useful
when briefing new staff on what the buttons mean.

**Do a `git checkout src/app/app-routing.module.ts` when you are finished**, or
put the whole trial on a throwaway branch:

```bash
git switch -c ui-kit-trial
```

---

## What to look for once it is open

The page is a working preview, not a screenshot. The things worth actually
trying:

- **Theme picker, top right.** Step through light, dark, midnight, warm and
  system. Every component should stay readable in all five without any
  component-specific work — that is the whole reason the kit reads your existing
  variables instead of defining its own colours.
- **Large text size, top right.** One attribute on `<html>` grows every control
  in the kit together. Worth deciding whether to offer it in Settings.
- **Narrow the window** to phone width. The record cards reflow and keep their
  action buttons; watch what the same data does in a nine-column table.
- **Tab through it with the keyboard.** Arrow keys move inside a choice group.
  Every focused control shows a visible ring.
- **Empty the patient name in the wizard** and try Next. Then read what the
  blocked message says — that sentence is the whole point of the component.
- **Push the discount past 20%.** It will not go.

Then hand the laptop to a technician and watch which control they hesitate over.
Most fixes at that point are one input property, not a rewrite.
