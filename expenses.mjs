import { CITIES, CATEGORIES, STORAGE_KEY, money, parseMoney, validDate, emptyState, decodeState,
    activeEntries, totals, queueEntry, applyRemote, acknowledge } from './expenses-core.mjs';

const $ = id => document.getElementById(id);
const form = $('expense-form');
const dialog = $('expense-dialog');
let state = emptyState();
let editingId = null;
let sourceButton = null;
let deletingId = null;
let deleteSourceButton = null;
let sync = null;
let connected = false;
let connectionError = false;
let starting = false;
let storageBlocked = false;
const inFlight = new Set();

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function storageError() {
    $('storage-error').textContent = '기기의 저장 공간을 사용할 수 없거나 저장된 기록을 읽지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요. 기존 기록은 덮어쓰지 않았어요.';
    $('storage-error').hidden = false;
}

function latest() {
    const stored = decodeState(localStorage.getItem(STORAGE_KEY));
    // A local-only cache failure must not silently discard the current session's records.
    return stored;
}

function persist(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    storageBlocked = false;
    $('storage-error').hidden = true;
}

function status() {
    const count = Object.keys(state.pending).length;
    const message = storageBlocked ? '기기 저장을 확인해 주세요.'
        : !navigator.onLine ? `오프라인 · 이 기기에 보관 중${count ? ` · 공유 대기 ${count}건` : ''}`
        : connectionError ? `이 기기에 보관 중 · 공유 연결을 확인해 주세요${count ? ` (${count}건 대기)` : ''}`
        : count ? `이 기기에 저장됨 · 공유 저장 대기 ${count}건`
        : connected ? '공유 기록 최신 상태 · 두 기기에서 함께 볼 수 있어요'
        : '이 기기에 보관 중 · 공유 기록 연결 중…';
    $('sync-status').textContent = message;
    $('retry-sync').hidden = connected && !connectionError && count === 0;
}

function render() {
    const entries = activeEntries(state);
    const all = totals(entries);
    $('grand-total').textContent = money(all.priceCents + all.tipCents);
    $('total-price').textContent = money(all.priceCents);
    $('total-tip').textContent = money(all.tipCents);
    $('entry-count').textContent = `${all.count}건`;
    const open = new Set([...document.querySelectorAll('.category[open]')].map(node => node.dataset.key));
    const focus = document.activeElement?.dataset.focusKey;
    const cards = CITIES.map(city => {
        const items = entries.filter(entry => entry.city === city.id);
        const sum = totals(items);
        const card = element('section', 'city-card');
        card.dataset.city = city.id;
        card.id = `ledger-${city.id}`;
        const heading = element('div', 'city-heading');
        const title = element('div');
        const h2 = element('h2', '', `${city.emoji} ${city.name}`);
        h2.id = `city-title-${city.id}`;
        card.setAttribute('aria-labelledby', h2.id);
        title.append(h2, element('p', '', `${city.region} · ${city.dates}`));
        const add = element('button', 'city-add', '＋');
        add.type = 'button';
        add.dataset.focusKey = `add-${city.id}`;
        add.setAttribute('aria-label', `${city.name} 지출 추가`);
        add.addEventListener('click', () => openForm(city.id, null, add));
        heading.append(title, add);
        const total = element('div', 'city-total');
        total.append(element('strong', '', money(sum.priceCents + sum.tipCents)),
            element('span', '', `Price ${money(sum.priceCents)} + Tip ${money(sum.tipCents)} · ${sum.count}건`));
        card.append(heading, total);
        if (!items.length) {
            const empty = element('div', 'empty-city');
            empty.append(element('p', '', '아직 기록한 지출이 없어요.'), element('span', '', '위의 + 버튼으로 첫 지출을 남겨보세요.'));
            card.append(empty);
        } else {
            const head = element('div', 'category-head');
            head.setAttribute('aria-hidden', 'true');
            for (const label of ['Category', 'Price', 'Tip']) head.append(element('span', '', label));
            card.append(head);
            for (const category of CATEGORIES) {
                const matching = items.filter(entry => entry.category === category.id);
                if (!matching.length) continue;
                const categoryTotal = totals(matching);
                const details = element('details', 'category');
                details.dataset.key = `${city.id}-${category.id}`;
                details.open = open.has(details.dataset.key);
                const summary = element('summary', 'category-summary');
                summary.dataset.focusKey = details.dataset.key;
                summary.setAttribute('aria-label', `${city.name} ${category.name} ${matching.length}건, 금액 ${money(categoryTotal.priceCents)}, 팁 ${money(categoryTotal.tipCents)}, 상세 내역`);
                const name = element('span');
                const chevron = element('span', 'chevron', '▶');
                chevron.setAttribute('aria-hidden', 'true');
                name.append(chevron, element('span', '', `${category.emoji} ${category.name}`), element('span', 'category-count', `${matching.length}건`));
                summary.append(name, element('strong', '', money(categoryTotal.priceCents)), element('span', 'tip-value', money(categoryTotal.tipCents)));
                const content = element('div', 'category-detail');
                content.append(element('p', 'category-subtotal', `팁 포함 ${money(categoryTotal.priceCents + categoryTotal.tipCents)}`));
                for (const entry of matching) {
                    const item = element('div', 'expense-item');
                    const row = element('button', 'expense-row');
                    row.type = 'button';
                    row.dataset.focusKey = entry.id;
                    row.setAttribute('aria-label', `${entry.date} ${entry.merchant}, ${money(entry.priceCents + entry.tipCents)}, 상세 및 수정`);
                    const description = element('span');
                    description.append(element('strong', '', entry.merchant), element('small', '', `${entry.date} · 상세 / 수정${state.pending[entry.id] ? ' · 공유 대기' : ''}`));
                    if (entry.note) description.append(element('small', 'expense-note', entry.note));
                    const amount = element('span', 'expense-money');
                    amount.append(element('strong', '', money(entry.priceCents + entry.tipCents)), element('small', '', `Price ${money(entry.priceCents)} · Tip ${money(entry.tipCents)}`));
                    row.append(description, amount);
                    row.addEventListener('click', () => openForm(entry.city, entry, row));
                    const actions = element('div', 'expense-actions');
                    const edit = element('button', 'expense-action edit-action', '수정');
                    edit.type = 'button';
                    edit.dataset.focusKey = `${entry.id}_edit`;
                    edit.setAttribute('aria-label', `${entry.merchant} 지출 수정`);
                    edit.addEventListener('click', () => openForm(entry.city, entry, edit));
                    const remove = element('button', 'expense-action delete-action', '삭제');
                    remove.type = 'button';
                    remove.dataset.focusKey = `${entry.id}_delete`;
                    remove.setAttribute('aria-label', `${entry.merchant} 지출 삭제`);
                    remove.addEventListener('click', () => requestDelete(entry, remove));
                    actions.append(edit, remove);
                    item.append(row, actions);
                    content.append(item);
                }
                details.append(summary, content);
                card.append(details);
            }
        }
        return card;
    });
    $('city-ledgers').replaceChildren(...cards);
    if (focus && !dialog.open) document.querySelector(`[data-focus-key="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
    status();
}

function localDate(cityId) {
    const city = CITIES.find(item => item.id === cityId) || CITIES[0];
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: city.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function openForm(cityId, entry = null, trigger = null) {
    form.reset();
    sourceButton = trigger;
    editingId = entry?.id || null;
    $('form-title').textContent = entry ? '지출 상세 · 수정' : '지출 추가';
    $('expense-city').value = entry?.city || cityId;
    $('expense-date').value = entry?.date || localDate(cityId);
    $('expense-merchant').value = entry?.merchant || '';
    $('expense-category').value = entry?.category || 'food';
    $('expense-price').value = entry ? (entry.priceCents / 100).toFixed(2) : '';
    $('expense-tip').value = entry ? (entry.tipCents / 100).toFixed(2) : '0';
    $('expense-note').value = entry?.note || '';
    $('delete-expense').hidden = !entry;
    $('save-expense').textContent = entry ? '수정 저장' : '저장';
    $('form-error').hidden = true;
    preview();
    dialog.showModal();
}

function preview() {
    try { $('form-total').textContent = money(parseMoney($('expense-price').value || '0') + parseMoney($('expense-tip').value || '0')); }
    catch { $('form-total').textContent = '금액 확인'; }
}

function reportFormError(error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
}

function commit(entry) {
    // Read again immediately before each mutation so another tab's records are retained.
    try { persist(queueEntry(latest(), entry)); }
    catch (error) { storageBlocked = true; storageError(); status(); throw new Error('기기에 저장하지 못했어요. 입력 내용은 유지되어 있어요. 저장 공간을 확인하고 다시 시도해 주세요.'); }
    render();
    void flush();
}

function closeForm() { dialog.close(); }

form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
        const priceCents = parseMoney($('expense-price').value);
        const tipCents = parseMoney($('expense-tip').value);
        if (priceCents + tipCents <= 0) throw new Error('금액과 팁의 합계가 0보다 커야 해요.');
        const date = $('expense-date').value;
        const merchant = $('expense-merchant').value.trim();
        if (!merchant) throw new Error('사용처를 입력해 주세요.');
        if (!validDate(date)) throw new Error('올바른 날짜를 입력해 주세요.');
        if (editingId && (!state.records[editingId] || state.records[editingId].deleted)) throw new Error('다른 기기에서 삭제한 기록이에요. 창을 닫고 다시 확인해 주세요.');
        commit({ id: editingId || crypto.randomUUID(), mutationId: crypto.randomUUID(), city: $('expense-city').value,
            category: $('expense-category').value, date, merchant, priceCents, tipCents,
            note: $('expense-note').value.trim(), deleted: false, updatedAt: new Date().toISOString() });
        closeForm();
    } catch (error) { reportFormError(error); }
});

for (const button of document.querySelectorAll('[data-tip]')) button.addEventListener('click', () => {
    try {
        const cents = Math.round(parseMoney($('expense-price').value || '0') * Number(button.dataset.tip) / 100);
        $('expense-tip').value = (cents / 100).toFixed(2);
        preview();
    } catch (error) { reportFormError(error); }
});
$('expense-price').addEventListener('input', preview);
$('expense-tip').addEventListener('input', preview);
$('expense-city').addEventListener('change', () => { if (!editingId) $('expense-date').value = localDate($('expense-city').value); });
$('add-expense').addEventListener('click', event => openForm('la', null, event.currentTarget));
for (const id of ['close-dialog', 'cancel-expense']) $(id).addEventListener('click', closeForm);
dialog.addEventListener('close', () => {
    const key = sourceButton?.dataset.focusKey;
    const target = sourceButton?.isConnected ? sourceButton : key ? document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null;
    (target || $('add-expense')).focus({ preventScroll: true });
});
function requestDelete(entry, trigger) {
    if (!entry || entry.deleted) return;
    deletingId = entry.id;
    deleteSourceButton = trigger;
    $('delete-description').textContent = `${entry.merchant} · ${money(entry.priceCents + entry.tipCents)} 내역이 두 사람의 가계부에서 삭제돼요.`;
    $('delete-error').hidden = true;
    $('delete-dialog').showModal();
    $('cancel-delete').focus();
}
$('delete-expense').addEventListener('click', event => requestDelete(state.records[editingId], event.currentTarget));
$('delete-dialog').addEventListener('close', () => {
    deletingId = null;
    const key = deleteSourceButton?.dataset.focusKey;
    const target = deleteSourceButton?.isConnected ? deleteSourceButton
        : key ? document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null;
    (target || $('add-expense')).focus({ preventScroll: true });
});
$('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
$('confirm-delete').addEventListener('click', () => {
    try {
        const entry = latest().records[deletingId];
        if (!entry) throw new Error('삭제할 기록을 찾을 수 없어요.');
        commit({ ...entry, deleted: true, mutationId: crypto.randomUUID(), updatedAt: new Date().toISOString() });
        $('delete-dialog').close();
        if (dialog.open && editingId === entry.id) closeForm();
    } catch (error) {
        $('delete-error').textContent = error.message;
        $('delete-error').hidden = false;
    }
});

// Shared Firestore records use one document per expense. An offline edit cannot
// overwrite the entire trip, and durable tombstones prevent deleted items returning.
async function flush() {
    if (!sync || !navigator.onLine || connectionError || storageBlocked) return;
    for (const entry of Object.values(state.pending)) {
        if (inFlight.has(entry.id)) continue;
        inFlight.add(entry.id);
        sync.write(entry).then(() => {
            persist(acknowledge(latest(), entry.id, entry.mutationId));
            render();
        }).catch(error => {
            connectionError = true;
            if (error.name === 'QuotaExceededError') { storageBlocked = true; storageError(); }
            status();
        }).finally(() => {
            inFlight.delete(entry.id);
            // An edit made while a previous write was in flight still needs sending.
            if (!connectionError && state.pending[entry.id]) void flush();
        });
    }
}

async function connect() {
    if (starting || storageBlocked) return;
    starting = true;
    connected = false;
    connectionError = false;
    sync?.stop();
    status();
    const timeout = setTimeout(() => { if (!connected) { connectionError = true; status(); } }, 12000);
    try {
        const { createExpenseSync } = await import('./expenses-sync.mjs');
        sync = createExpenseSync((records, fromCache) => {
            try { persist(applyRemote(latest(), records)); }
            catch { storageBlocked = true; storageError(); }
            if (!fromCache) { connected = true; connectionError = false; clearTimeout(timeout); }
            render();
            if (!fromCache) void flush();
        }, () => { connectionError = true; connected = false; clearTimeout(timeout); status(); });
        connectionError = false;
        void flush();
    } catch { connectionError = true; clearTimeout(timeout); }
    finally { starting = false; status(); }
}

for (const city of CITIES) {
    const option = element('option', '', `${city.emoji} ${city.name} · ${city.region}`);
    option.value = city.id;
    $('expense-city').append(option);
}
for (const category of CATEGORIES) {
    const option = element('option', '', `${category.emoji} ${category.name}`);
    option.value = category.id;
    $('expense-category').append(option);
}
$('retry-sync').addEventListener('click', () => {
    try { state = latest(); storageBlocked = false; $('storage-error').hidden = true; }
    catch { storageBlocked = true; storageError(); }
    render();
    void connect();
});
window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    try { state = latest(); render(); void flush(); }
    catch { storageBlocked = true; storageError(); status(); }
});
window.addEventListener('online', () => { void connect(); });
window.addEventListener('offline', status);
try { state = latest(); }
catch { storageBlocked = true; storageError(); }
render();
void connect();
