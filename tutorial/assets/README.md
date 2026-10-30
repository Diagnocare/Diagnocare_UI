# Embedded fonts

`noto-deva-400.woff2` and `noto-deva-600.woff2` are **Noto Sans Devanagari**, taken from
the npm package `@fontsource/noto-sans-devanagari@5.3.0`.

Licensed under the **SIL Open Font License 1.1**, which permits redistribution and
embedding: https://openfontlicense.org/

They are committed here because this container has no Devanagari system font, and the
Hindi captions in the recording must render identically wherever the pipeline is run
rather than falling back to whatever face the host browser happens to pick. The recorder
inlines the 400 weight as base64 into the page at record time (`recorder/overlay.js`).
