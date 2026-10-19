export const CITIES = [
    { id: 'la', name: 'LA', region: '캘리포니아', emoji: '🌴', dates: '12/3–12/7', timezone: 'America/Los_Angeles' },
    { id: 'vegas', name: '라스베이거스', region: '네바다', emoji: '🎰', dates: '12/7–12/10', timezone: 'America/Los_Angeles' },
    { id: 'atlanta', name: '애틀랜타', region: '조지아', emoji: '🍑', dates: '12/10–12/16', timezone: 'America/New_York' },
    { id: 'nyc', name: '뉴욕', region: '뉴욕', emoji: '🗽', dates: '12/16–12/26', timezone: 'America/New_York' }
];
export const CATEGORIES = [
    { id: 'food', name: '식사', emoji: '🍽️' },
    { id: 'cafe', name: '카페·간식', emoji: '☕' },
    { id: 'transport', name: '교통·주유·주차', emoji: '🚗' },
    { id: 'shopping', name: '쇼핑', emoji: '🛍️' },
    { id: 'activities', name: '관광·티켓', emoji: '🎟️' },
    { id: 'stay', name: '숙소·리조트 비용', emoji: '🛏️' },
    { id: 'other', name: '기타', emoji: '🧾' }
];
export const STORAGE_KEY = 'us-travel-expenses-2026-v1';
export const MAX_CENTS = 99999999;
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// All arithmetic uses integer cents, including tip presets and accumulated totals.
export function parseMoney(value) {
    const text = String(value).trim();
    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(text)) throw new Error('금액은 소수점 둘째 자리까지 입력해 주세요.');
    const [dollars, cents = ''] = text.split('.');
    const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw new Error('금액은 $999,999.99 이하로 입력해 주세요.');
    return result;
}

export function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validEntry(entry) {
    return entry && typeof entry.id === 'string' && /^[\w-]{1,100}$/.test(entry.id)
        && typeof entry.mutationId === 'string' && /^[\w-]{1,100}$/.test(entry.mutationId)
        && !['__proto__', 'constructor', 'prototype'].includes(entry.id)
        && CITIES.some(city => city.id === entry.city) && CATEGORIES.some(category => category.id === entry.category)
        && typeof entry.date === 'string' && validDate(entry.date)
        && typeof entry.merchant === 'string' && entry.merchant.trim().length > 0 && entry.merchant.length <= 120
        && typeof entry.note === 'string' && entry.note.length <= 1000
        // Older records do not have a payment method; keep them readable.
        && (entry.paymentMethod === undefined || ['cash', 'card'].includes(entry.paymentMethod))
        && [entry.priceCents, entry.tipCents].every(value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS)
        && entry.priceCents + entry.tipCents > 0 && typeof entry.deleted === 'boolean'
        && typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt));
}

export function emptyState() { return { schema: 1, records: {}, pending: {} }; }

export function decodeState(raw) {
    if (raw === null) return emptyState();
    const state = JSON.parse(raw);
    if (!state || state.schema !== 1 || !state.records || !state.pending) throw new Error('저장된 기록의 형식을 확인할 수 없어요.');
    for (const map of [state.records, state.pending]) {
        for (const [id, entry] of Object.entries(map)) {
            if (entry.id !== id || !validEntry(entry)) throw new Error('저장된 기록을 읽을 수 없어요.');
        }
    }
    for (const [id, entry] of Object.entries(state.pending)) {
        if (state.records[id]?.mutationId !== entry.mutationId) throw new Error('저장 대기 기록을 읽을 수 없어요.');
    }
    return state;
}

export function activeEntries(state) {
    return Object.values(state.records).filter(entry => validEntry(entry) && !entry.deleted)
        .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function totals(entries) {
    return entries.reduce((total, entry) => ({ priceCents: total.priceCents + entry.priceCents,
        tipCents: total.tipCents + entry.tipCents, count: total.count + 1 }), { priceCents: 0, tipCents: 0, count: 0 });
}

export function queueEntry(state, entry) {
    if (!validEntry(entry)) throw new Error('입력 내용을 확인해 주세요.');
    return { ...state, records: { ...state.records, [entry.id]: entry }, pending: { ...state.pending, [entry.id]: entry } };
}

export function applyRemote(state, records) {
    const next = { ...state, records: { ...state.records } };
    for (const entry of records) {
        if (validEntry(entry) && !state.pending[entry.id]) next.records[entry.id] = entry;
    }
    return next;
}

export function acknowledge(state, id, mutationId) {
    const next = { ...state, pending: { ...state.pending } };
    // A response for an older edit must never clear a newer queued edit/deletion.
    if (next.pending[id]?.mutationId === mutationId) delete next.pending[id];
    return next;
}
