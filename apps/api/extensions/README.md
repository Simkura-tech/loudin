# API extensions

Code that lives **on top of** Loudin goes here, one folder per extension:

```
extensions/
├── index.js          # the loader — upstream-owned, don't edit
├── README.md         # this file
└── billing/          # ← yours
    ├── index.js      # exports preBody / routes / authGate / start
    └── migrations/   # *.sql, run after core migrations
```

Loudin ships no extensions. Anything in a subdirectory is never touched by
upstream, so `git merge upstream/main` stays conflict-free.

Full guide: [`docs/extensions.md`](../../../docs/extensions.md).
