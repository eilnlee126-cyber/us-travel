# Travel expense ledger

Open `expenses.html` from the **여행 가계부** navigation item on any main travel page.
The four destinations are LA/California, Las Vegas/Nevada, Atlanta/Georgia, and
New York/New York. All amounts are USD, stored as integer cents. Price includes
tax and excludes tip; totals include both. Existing itinerary estimates are not
imported as expenses.
Each new expense stores a `paymentMethod` of `cash` or `card`. Existing records
without that field remain readable and display 결제수단 미지정 until edited.

## Persistence and sharing

- Local records and an outbox are stored under `us-travel-expenses-2026-v1` in
  localStorage. Reloading preserves entries, edits, and deletions. Clearing site
  data can remove entries that have not reached shared storage.
- The shared adapter reuses the site's existing Firebase project
  `ustravel-513fb` and Firebase SDK 10.14.1. Each expense is a separate document
  in `tripExpenses2026`, with real-time updates through `onSnapshot`.
- Each edit has a unique mutation ID. Acknowledging an earlier write does not
  remove a newer queued edit. Deletions are tombstones, so they propagate to
  other devices and do not return after reload.
- Shared access follows the existing travel site's shared-page model, without
  a new account flow. The page explicitly explains that shared expenses are
  visible to people who can access the travel page. Do not store payment card
  details or other secrets in the ledger.
- The status line distinguishes local storage, pending uploads, successful
  connection, and errors. **A local save is not reported as a successful shared
  save.** The retry button reconnects and drains queued writes.

## Firebase access currently needs configuration

A read-only check of the new collection returned `403 PERMISSION_DENIED`
(`Missing or insufficient permissions`). No production expense records were
written as part of validation. The repository has no Firebase rules deployment
configuration. Consequently, local recording works, but cross-device sharing
cannot be confirmed or enabled from the repository alone.

An authorized project administrator must review the existing Firestore rules
before adding collection access. Preserve the existing rules for exchange rates
and checklists. If retaining this site's current shared-page access model, the
following **additional match block**, inside the existing
`match /databases/{database}/documents`, grants read and validated create/update
access only to the new expense collection. It intentionally does not grant hard
deletion. This is a proposed addition, not a replacement rules file and not an
already deployed rule.

```text
match /tripExpenses2026/{expenseId} {
  function validExpense() {
    let d = request.resource.data;
    return d.keys().hasAll(['id', 'mutationId', 'city', 'category', 'date',
             'merchant', 'note', 'priceCents', 'tipCents', 'deleted', 'updatedAt'])
      && d.keys().hasOnly(['id', 'mutationId', 'city', 'category', 'date',
             'merchant', 'note', 'priceCents', 'tipCents', 'deleted', 'updatedAt', 'paymentMethod'])
      && d.id == expenseId
      && d.id is string && d.id.matches('^[a-zA-Z0-9_-]{1,100}$')
      && !(d.id in ['__proto__', 'constructor', 'prototype'])
      && d.mutationId is string && d.mutationId.matches('^[a-zA-Z0-9_-]{1,100}$')
      && d.city in ['la', 'vegas', 'atlanta', 'nyc']
      && d.category in ['food', 'cafe', 'transport', 'shopping', 'activities', 'stay', 'other']
      && d.date is string && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      && d.merchant is string && d.merchant.size() > 0 && d.merchant.size() <= 120
      && d.note is string && d.note.size() <= 1000
      && (!('paymentMethod' in d) || d.paymentMethod in ['cash', 'card'])
      && d.priceCents is int && d.priceCents >= 0 && d.priceCents <= 99999999
      && d.tipCents is int && d.tipCents >= 0 && d.tipCents <= 99999999
      && d.priceCents + d.tipCents > 0
      && d.deleted is bool
      && d.updatedAt is string && d.updatedAt.size() <= 40;
  }
  allow read: if true;
  allow create, update: if validExpense();
}
```

For private financial records, add an owner/couple authentication flow and
restrict reads and writes to their verified identities instead of using the
shared-page access model above. A public GitHub repository and the Firebase API
key do not provide privacy controls.

## Verification

Run `node --test tests/expenses.test.mjs` for financial calculation, schema
validation, persistence, remote merges, and outbox acknowledgement checks.
JavaScript syntax and navigation links were checked. A DOM simulation with a
mocked Firebase adapter additionally exercised adding in all four cities, tip
presets, opening details, moving/editing records, cancellation/deletion, reload,
failed shared access, reconnecting, safe merchant text rendering, and failed
localStorage writes. No real browser layout or production shared write was
verified in this environment.
