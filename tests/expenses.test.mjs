import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, parseMoney, money, validDate, validEntry, emptyState, decodeState, queueEntry,
    applyRemote, acknowledge, activeEntries, totals } from '../expenses-core.mjs';

const entry = (override = {}) => ({ id: 'expense-1', mutationId: 'edit-1', city: 'la', category: 'food',
    date: '2026-12-04', merchant: 'Restaurant', note: '', priceCents: 1234, tipCents: 222,
    deleted: false, updatedAt: '2026-12-04T20:00:00.000Z', ...override });

test('USD input preserves cents and rejects ambiguous or out-of-range amounts', () => {
    assert.equal(parseMoney('0.10'), 10);
    assert.equal(parseMoney('12.34'), 1234);
    assert.equal(parseMoney('12.3'), 1230);
    assert.equal(parseMoney('0'), 0);
    assert.equal(money(1456), '$14.56');
    for (const value of ['', '-1', '1e3', 'NaN', '0.001', '1,000', '1000000']) assert.throws(() => parseMoney(value));
});

test('tip plus bill and accumulated totals are exact over many purchases', () => {
    const entries = Array.from({ length: 100 }, (_, i) => entry({ id: `expense-${i}`, priceCents: parseMoney('0.10'), tipCents: parseMoney('0.02') }));
    assert.deepEqual(totals(entries), { priceCents: 1000, tipCents: 200, count: 100 });
    assert.equal(Math.round(parseMoney('12.34') * 18 / 100), 222);
});

test('all four destinations and categories accumulate independently', () => {
    let state = emptyState();
    for (const city of CITIES) state = queueEntry(state, entry({ id: city.id, city: city.id }));
    const items = activeEntries(state);
    for (const city of CITIES) assert.deepEqual(totals(items.filter(item => item.city === city.id)), { priceCents: 1234, tipCents: 222, count: 1 });
    assert.equal(totals(items).count, 4);
    state = queueEntry(state, entry({ city: 'nyc', category: 'shopping', priceCents: 2000, tipCents: 0 }));
    assert.equal(totals(activeEntries(state).filter(item => item.city === 'nyc')).priceCents, 3234);
});

test('offline add/edit/delete survive reload without returning deleted expenses', () => {
    let state = queueEntry(emptyState(), entry());
    state = decodeState(JSON.stringify(state));
    assert.equal(activeEntries(state).length, 1);
    state = queueEntry(state, entry({ mutationId: 'edit-2', priceCents: 5000 }));
    assert.equal(activeEntries(decodeState(JSON.stringify(state)))[0].priceCents, 5000);
    state = queueEntry(state, entry({ mutationId: 'edit-3', deleted: true }));
    state = decodeState(JSON.stringify(state));
    assert.equal(activeEntries(state).length, 0);
    assert.equal(state.pending['expense-1'].deleted, true);
});

test('a late acknowledgement never clears a newer edit or deletion', () => {
    let state = queueEntry(emptyState(), entry());
    state = queueEntry(state, entry({ mutationId: 'edit-2', deleted: true }));
    state = acknowledge(state, 'expense-1', 'edit-1');
    assert.equal(state.pending['expense-1'].mutationId, 'edit-2');
    state = acknowledge(state, 'expense-1', 'edit-2');
    assert.equal(Object.keys(state.pending).length, 0);
    assert.equal(state.records['expense-1'].deleted, true);
});

test('remote snapshots preserve pending edits and independent purchases from the other device', () => {
    let state = queueEntry(emptyState(), entry({ mutationId: 'local-edit', priceCents: 5000 }));
    state = applyRemote(state, [entry(), entry({ id: 'husband-purchase', city: 'atlanta' })]);
    assert.equal(state.records['expense-1'].priceCents, 5000);
    assert.equal(activeEntries(state).length, 2);
    assert.equal(state.pending['expense-1'].mutationId, 'local-edit');
});

test('shared edits can move a purchase to another city; shared deletion changes all totals', () => {
    let state = applyRemote(emptyState(), [entry()]);
    state = applyRemote(state, [entry({ city: 'vegas', mutationId: 'moved' })]);
    assert.equal(totals(activeEntries(state).filter(item => item.city === 'la')).count, 0);
    assert.equal(totals(activeEntries(state).filter(item => item.city === 'vegas')).count, 1);
    state = applyRemote(state, [entry({ deleted: true, mutationId: 'deleted' })]);
    assert.deepEqual(totals(activeEntries(state)), { priceCents: 0, tipCents: 0, count: 0 });
});

test('invalid dates, malformed cache, and untrusted remote documents are rejected', () => {
    assert.equal(validDate('2026-02-30'), false);
    assert.equal(validDate('2026-12-10'), true);
    assert.equal(validEntry(entry({ priceCents: 1.2 })), false);
    assert.equal(validEntry(entry({ id: undefined })), false);
    assert.equal(validEntry(entry({ id: '__proto__' })), false);
    assert.equal(validEntry(entry({ priceCents: 0, tipCents: 0 })), false);
    assert.throws(() => decodeState('{bad json'));
    assert.throws(() => decodeState('{"schema":2,"records":{},"pending":{}}'));
    const malformed = { schema: 1, records: {}, pending: { 'expense-1': entry() } };
    assert.throws(() => decodeState(JSON.stringify(malformed)));
    assert.equal(activeEntries(applyRemote(emptyState(), [entry({ city: 'unknown' }), entry({ priceCents: -1 })])).length, 0);
});

test('cash/card choices persist while older records remain readable', () => {
    let state = queueEntry(emptyState(), entry());
    assert.equal(activeEntries(decodeState(JSON.stringify(state)))[0].paymentMethod, undefined);
    state = queueEntry(state, entry({ paymentMethod: 'cash', mutationId: 'cash-edit' }));
    assert.equal(activeEntries(decodeState(JSON.stringify(state)))[0].paymentMethod, 'cash');
    state = acknowledge(state, 'expense-1', 'cash-edit');
    state = applyRemote(state, [entry({ paymentMethod: 'card', mutationId: 'card-edit' })]);
    assert.equal(activeEntries(state)[0].paymentMethod, 'card');
    assert.equal(validEntry(entry({ paymentMethod: 'other' })), false);
    assert.deepEqual(totals(activeEntries(state)), { priceCents: 1234, tipCents: 222, count: 1 });
});
