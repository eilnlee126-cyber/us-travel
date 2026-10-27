const categories = [
            {
                label: '🌐 General', color: '#667eea',
                items: [
                    { id: 'g1', text: '⚠️ 결혼증명서 준비 (영문) — 제일 중요! 남편 입국 시 필요할 수 있음' },
                    { id: 'g2', text: '남편 ESTA 신청 (출발 최소 72시간 전! / 2년 유효 / $21)' },
                    { id: 'g3', text: '남편 여권 유효기간 확인 (입국일 기준 6개월 이상)' },
                    { id: 'g4', text: '여행자 보험 가입 (미국 병원비 무서움 😱)' },
                    { id: 'g5', text: '미국 여권 유효기간 확인 (나)' },
                    { id: 'g6', text: 'TSA PreCheck / Global Entry 알아보기 (나만 가능, $78~100)' },
                    { id: 'g7', text: '핫팩 & 히트텍 챙기기' },
                    { id: 'g8', text: '국내선 항공편 예약 (LA→베가스→ATL→뉴욕)' },
                    { id: 'g9', text: 'eSIM 준비 (Klook 사은품 5GB/15일 × 2개 + 나머지 9일 추가 구매)' },
                ]
            },
            {
                label: '🌴 LA', color: '#f5576c',
                items: [
                    { id: 'la1', text: '인천→LA 항공권 예약', link: 'la.html#la-flight' },
                    { id: 'la2', text: 'LA 숙소 예약 (Short Stories Hotel)', link: 'la.html#la-hotel' },
                    { id: 'la3', text: '디즈니랜드 티켓 예약' },
                ]
            },
            {
                label: '🎰 Vegas', color: '#fda085',
                items: [
                    { id: 'vg1', text: '베가스 숙소 예약 (The Cosmopolitan · 스튜디오 킹 테라스)', link: 'vegas.html#vegas-hotel' },
                    { id: 'vg2', text: '베가스 쇼 티켓 예약 (태양의 서커스 등)' },
                    { id: 'vg3', text: '그랜드캐니언 당일투어 예약 (조이감성투어)', link: 'vegas.html#vegas-tour' },
                ]
            },
            {
                label: '🍑 Atlanta', color: '#4facfe',
                items: [
                    { id: 'at1', text: '애틀란타 숙소 예약' },
                    { id: 'at2', text: '애틀란타 렌트카 예약' },
                ]
            },
            {
                label: '🗽 NYC', color: '#764ba2',
                items: [
                    { id: 'ny1', text: 'NYC 숙소 예약 (TownePlace Suites Chelsea)', link: 'nyc.html#nyc-hotel' },
                    { id: 'ny2', text: '브로드웨이 티켓 예약 (인기 공연은 미리!)' },
                    { id: 'ny3', text: '자유의 여신상 페리 예약' },
                    { id: 'ny4', text: '뉴욕→인천 귀국 항공편 예약 (아시아나 OZ221)', link: 'nyc.html#nyc-flight' },
                ]
            },
            {
                label: '⚠️ 출발 전 할 일', color: '#ff3b30',
                items: [
                    { id: 'ebola-certificate', text: '에볼라증명서' },
                    { id: 'todo1', text: '⚠️ 12/15 델타 ATL→EWR 온라인 체크인 + 마일리지로 위탁수하물 추가! (남은 마일: 10,628 · 수하물 4,500마일 × 2명 = 9,000마일)' },
                ]
            },
        ];
const key = 'us-travel-checklist-editor-v1';
const container = document.getElementById('checklist-container');
const status = document.getElementById('checklist-status');
let state = { checked: {}, edits: {}, pending: {} };
let remote = null;
let sending = false;
let editing = null;
try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) state = saved; } catch { status.textContent = '기기 저장 기록을 확인해 주세요.'; }
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
function save(patch) {
    const next = structuredClone(state);
    if (patch.id) next.edits[patch.id] = { ...next.edits[patch.id], ...patch.value };
    else next.checked[patch.checkedId] = patch.checked;
    const field = patch.id ? `item:${patch.id}` : `check:${patch.checkedId}`;
    next.pending[field] = { ...patch, ...(patch.id ? { value: { ...next.pending[field]?.value, ...patch.value } } : {}), version: crypto.randomUUID() };
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { status.textContent = '저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'; return false; }
    state = next;
    status.textContent = '이 기기에 저장됨 · 공유 저장 대기';
    void flush();
    return true;
}
function itemsFor(index) {
    const items = categories[index].items.map(item => ({ ...item, ...state.edits[item.id] }));
    for (const [id, item] of Object.entries(state.edits)) {
        if (item.category === index && !categories.some(cat => cat.items.some(base => base.id === id))) items.push({ ...item, id });
    }
    return items.filter(item => !item.deleted && typeof item.text === 'string');
}
function button(text, action, cls = '') {
    const node = el('button', text, `check-button ${cls}`); node.type = 'button'; node.addEventListener('click', action); return node;
}
function textForm(value, label, submit, cancel) {
    const form = el('form', null, 'check-form');
    const input = el('input', null, 'check-text'); input.type = 'text'; input.value = value; input.maxLength = 500; input.required = true; input.placeholder = '새 항목을 입력하세요'; input.setAttribute('aria-label', label);
    const add = el('button', value ? '저장' : '추가', 'check-button'); add.type = 'submit';
    form.append(input, add);
    if (cancel) form.append(button('취소', cancel));
    form.addEventListener('submit', event => { event.preventDefault(); const text = input.value.trim(); if (!text) { input.setCustomValidity('내용을 입력해 주세요.'); input.reportValidity(); return; } input.setCustomValidity(''); if (submit(text)) input.value = ''; });
    input.addEventListener('input', () => input.setCustomValidity(''));
    return form;
}
function render() {
    const all = categories.flatMap((_, index) => itemsFor(index));
    const done = all.filter(item => state.checked[item.id]).length;
    container.replaceChildren(el('p', `${done} / ${all.length} 완료`));
    categories.forEach((cat, index) => {
        const section = el('section', null, 'check-section');
        const items = itemsFor(index);
        section.append(el('h4', `${cat.label} · ${items.filter(i => state.checked[i.id]).length}/${items.length}`, 'check-heading'));
        items.sort((a,b) => Number(!!state.checked[a.id]) - Number(!!state.checked[b.id]));
        for (const item of items) {
            const row = el('div', null, 'check-row'); row.dataset.id = item.id;
            const label = el('label', null, 'check-label');
            const check = el('input'); check.type = 'checkbox'; check.checked = !!state.checked[item.id]; check.setAttribute('aria-label', `${item.text} 완료`);
            check.addEventListener('change', () => { if (save({ checkedId: item.id, checked: check.checked })) render(); else check.checked = !check.checked; });
            const text = el('span', item.text); if (check.checked) text.style.textDecoration = 'line-through';
            label.append(check, text); row.append(label);
            const actions = el('div', null, 'check-actions');
            if (item.link) { const link = el('a', '확인 →', 'check-button'); link.href = item.link; actions.append(link); }
            actions.append(button('수정', () => { editing = item.id; render(); container.querySelector('.check-edit input')?.focus(); }), button('삭제', () => {
                if (window.confirm(`“${item.text}” 항목을 삭제할까요?`) && save({ id: item.id, value: { deleted: true } })) render();
            }, 'check-delete'));
            row.append(actions);
            if (editing === item.id) {
                const form = textForm(item.text, '항목 수정', value => { if (!save({ id: item.id, value: { text: value } })) return false; editing = null; render(); return true; }, () => { editing = null; render(); });
                form.classList.add('check-edit'); row.append(form);
            }
            section.append(row);
        }
        section.append(textForm('', `${cat.label} 새 항목`, text => { const id = `custom-${crypto.randomUUID()}`; if (!save({ id, value: { text, category: index, deleted: false } })) return false; render(); return true; }));
        container.append(section);
    });
}
async function flush() {
    if (!remote || sending) return;
    sending = true;
    let success = false;
    try {
        for (const [field, patch] of Object.entries(state.pending)) {
            const data = patch.id ? { editableItems: { [patch.id]: patch.value } } : { [patch.checkedId]: patch.checked };
            await remote.write(data);
            if (state.pending[field]?.version === patch.version) delete state.pending[field];
            localStorage.setItem(key, JSON.stringify(state));
        }
        success = true;
        status.textContent = Object.keys(state.pending).length ? '이 기기에 저장됨 · 공유 저장 대기' : '공유 저장 완료';
    } catch { status.textContent = '이 기기에 저장됨 · 공유 연결을 확인해 주세요.'; }
    finally { sending = false; }
    if (success && Object.keys(state.pending).length) void flush();
}
render();
status.textContent = '이 기기에 보관 중 · 공유 기록 연결 중…';
(async () => {
    try {
        const [{ initializeApp }, { getFirestore, doc, getDoc, setDoc }] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
        ]);
        const app = initializeApp({ apiKey: 'AIzaSyDsa9pz-O_s4KUXvJ5duuRIWCQx_umspuc', authDomain: 'ustravel-513fb.firebaseapp.com', projectId: 'ustravel-513fb', appId: '1:57988064191:web:5f08645b91ed9d21c3370a' }, 'checklist');
        const ref = doc(getFirestore(app), 'checklist', 'state');
        const snapshot = await getDoc(ref);
        const data = snapshot.exists() ? snapshot.data() : {};
        const checked = Object.fromEntries(Object.entries(data).filter(([id, value]) => typeof value === 'boolean'));
        const edits = data.editableItems || {};
        for (const patch of Object.values(state.pending)) { if (patch.id) edits[patch.id] = { ...edits[patch.id], ...patch.value }; else checked[patch.checkedId] = patch.checked; }
        state = { ...state, checked, edits };
        localStorage.setItem(key, JSON.stringify(state)); render();
        remote = { write: value => setDoc(ref, value, { merge: true }) };
        await flush();
    } catch { status.textContent = '이 기기에 보관 중 · 공유 연결을 확인해 주세요.'; }
})();
window.addEventListener('online', () => void flush());
