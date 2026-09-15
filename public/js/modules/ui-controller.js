/* ═══════════════════════════════════════════════
   UI-CONTROLLER.JS — Modal & bottom-sheet controls
   ═══════════════════════════════════════════════ */

/* ── Toast ── */
export function showToast(msg, color = '#DC143C') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = color;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
}

/* ── Pending Drawer ── */
let pendingCountdownTimers = [];

export function openPendingDrawer() {
    loadPendingRewards();
    document.getElementById('pendingDrawer').classList.add('open');
}

export function closePendingDrawer(e) {
    if (e && e.target !== document.getElementById('pendingDrawer')) return;
    document.getElementById('pendingDrawer').classList.remove('open');
    pendingCountdownTimers.forEach(t => clearInterval(t));
    pendingCountdownTimers = [];
}

export function loadPendingRewards() {
    const tg = window.getTelegramUser ? window.getTelegramUser() : null;
    if (!tg || !tg.telegram_id) return;
    pendingCountdownTimers.forEach(t => clearInterval(t));
    pendingCountdownTimers = [];
    fetch('/api/pending?telegram_id=' + encodeURIComponent(tg.telegram_id))
        .then(r => r.json())
        .then(rows => {
            window.myPendingBalance = rows.reduce((s, r) => s + r.amount, 0);
            const el = document.getElementById('dashPendingAmount');
            if (el) el.textContent = window.myPendingBalance + ' ETB';
            renderPendingList(rows);
        });
}

function renderPendingList(rows) {
    const container = document.getElementById('pendingList');
    if (!rows || rows.length === 0) {
        container.innerHTML = '<div class="pending-empty">No pending rewards</div>';
        return;
    }
    container.innerHTML = '';
    rows.forEach((row, idx) => {
        const item = document.createElement('div');
        item.className = 'pending-item';
        const cdId = 'pcd_' + idx;
        item.innerHTML =
            '<div class="pending-item-left">' +
                '<div class="pending-item-reason">' + row.reason + '</div>' +
                '<div class="pending-item-countdown" id="' + cdId + '">calculating...</div>' +
            '</div>' +
            '<div class="pending-item-amount">+' + row.amount + ' ETB</div>';
        container.appendChild(item);
        const rel = new Date(row.release_at).getTime();
        function tick() {
            const rem = rel - Date.now();
            const el = document.getElementById(cdId);
            if (!el) return;
            if (rem <= 0) { el.textContent = 'Releasing soon...'; return; }
            const h = Math.floor(rem/3600000), m = Math.floor((rem%3600000)/60000), s = Math.floor((rem%60000)/1000);
            el.textContent = 'Releases in ' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        }
        tick();
        pendingCountdownTimers.push(setInterval(tick, 1000));
    });
}

/* ── Bottom sheet drag ── */
export function attachBsheetDrag(overlay) {
    const box    = overlay.querySelector('.bsheet-box');
    const handle = overlay.querySelector('.bsheet-handle-wrap');
    if (!box || !handle) return;

    let startY = 0, startH = 0, active = false, didDrag = false;
    const COLLAPSED = window.innerHeight * 0.54;
    const EXPANDED  = window.innerHeight * 0.92;
    const DRAG_THRESHOLD = 8;

    function getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

    function onStart(e) {
        active = true;
        didDrag = false;
        startY = getY(e);
        startH = box.getBoundingClientRect().height;
        e.preventDefault();
    }

    function onMove(e) {
        if (!active) return;
        const delta = startY - getY(e);
        if (!didDrag && Math.abs(delta) > DRAG_THRESHOLD) {
            didDrag = true;
            box.classList.add('bs-dragging');
        }
        if (!didDrag) return;
        const newH = Math.min(EXPANDED, Math.max(120, startH + delta));
        box.style.height = newH + 'px';
        e.preventDefault();
    }

    function onEnd() {
        if (!active) return;
        active = false;
        if (didDrag) {
            box.classList.remove('bs-dragging');
            const currentH = parseFloat(box.style.height) || COLLAPSED;
            box.style.height = '';
            const midpoint = (COLLAPSED + EXPANDED) / 2;
            box.classList.toggle('bs-expanded', currentH > midpoint);
        } else {
            box.classList.toggle('bs-expanded');
        }
        didDrag = false;
    }

    handle.addEventListener('touchstart', onStart, { passive: false });
    handle.addEventListener('touchmove',  onMove,  { passive: false });
    handle.addEventListener('touchend',   onEnd,   { passive: true });

    handle.addEventListener('mousedown', onStart);
    const mmove = (e) => onMove(e);
    const mup   = ()  => onEnd();
    document.addEventListener('mousemove', mmove);
    document.addEventListener('mouseup',   mup);

    const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            document.removeEventListener('mousemove', mmove);
            document.removeEventListener('mouseup',   mup);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });
}

/* ── Deposit ── */
export function closeDepositModal() {
    const modal = document.getElementById('depositModal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 320);
}

/* ── Withdraw modal close ──
   NOTE: previously there was no exported close handler for the withdraw
   modal at all — only submitWithdraw() closed it, and only on a
   successful withdrawal. Any close/back/X button wired to
   `onclick="closeWithdrawModal()"` in the HTML had nothing to call,
   which is why the withdraw sheet never dismissed on its own. */
export function closeWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 320);
}

export function submitDeposit() {
    const txnId = (document.getElementById('depositTxnIdNew') || {}).value || '';
    const sms   = (document.getElementById('depositSmsNew')   || {}).value || '';
    const tg    = window.getTelegramUser ? window.getTelegramUser() : null;
    if (!tg || !tg.telegram_id) { showToast('Please open via Telegram', '#FF3D71'); return; }
    if (!txnId.trim() && !sms.trim()) { showToast('Please enter Transaction ID or paste SMS', '#FF3D71'); return; }
    const btn = document.getElementById('dmDepositBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
    fetch('/api/deposit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ telegram_id: tg.telegram_id, txn_id: txnId.trim() || undefined, raw_sms: sms.trim() || undefined })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            const msg = document.getElementById('dmResultMsg');
            if (msg) { msg.className = 'error'; msg.textContent = '❌ ' + data.error; msg.style.display = 'block'; }
            if (btn) { btn.disabled = false; btn.textContent = 'Deposit'; }
            return;
        }
        const bag = document.getElementById('dmBag');
        if (bag) { bag.classList.add('flip'); setTimeout(() => bag.classList.remove('flip'), 700); }
        const amt = document.getElementById('dmSuccessAmount');
        if (amt) { amt.textContent = '+' + data.amount + ' ETB'; amt.style.display = 'block'; }
        const msg = document.getElementById('dmResultMsg');
        if (msg) { msg.className = 'success'; msg.textContent = '✅ ' + data.amount + ' ETB deposited!'; msg.style.display = 'block'; }
        if (btn) btn.textContent = 'Done ✓';
        if (typeof window.setWallet === 'function') window.setWallet(data.newWallet);
        setTimeout(closeDepositModal, 2000);
    })
    .catch(() => {
        const msg = document.getElementById('dmResultMsg');
        if (msg) { msg.className = 'error'; msg.textContent = '❌ Network error, try again'; msg.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Deposit'; }
    });
}

/* ── Withdraw ── */
export function submitWithdraw() {
    const btn       = document.getElementById('wmConfirmBtn');
    const resultMsg = document.getElementById('wmResultMsg');
    const amount    = parseInt(document.getElementById('wmAmount').value) || 0;
    const phone     = (document.getElementById('wmPhone') || {}).value || '';
    const name      = (document.getElementById('wmName') || {}).value || '';
    const max       = Math.floor((window.myWallet || 0) * 0.9);
    const tg        = window.getTelegramUser ? window.getTelegramUser() : null;
    if (resultMsg) resultMsg.style.display = 'none';
    if (!window._wmSelected) {
        if (resultMsg) { resultMsg.className = 'error'; resultMsg.textContent = '❌ Please select Telebirr or CBEbirr.'; resultMsg.style.display = 'block'; }
        return;
    }
    if (amount < 200) {
        if (resultMsg) { resultMsg.className = 'error'; resultMsg.textContent = '❌ Minimum withdrawal is 200 ETB.'; resultMsg.style.display = 'block'; }
        return;
    }
    if (amount > max) {
        if (resultMsg) { resultMsg.className = 'error'; resultMsg.textContent = '❌ Maximum is ' + max + ' ETB (90% of balance).'; resultMsg.style.display = 'block'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
    fetch('/api/withdraw', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ telegram_id: tg.telegram_id, provider: window._wmSelected, phone, name, amount })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            if (resultMsg) { resultMsg.className = 'error'; resultMsg.textContent = '❌ ' + data.error; resultMsg.style.display = 'block'; }
            if (btn) { btn.disabled = false; btn.textContent = 'Withdraw'; }
            return;
        }
        const icon = document.getElementById('wmIcon');
        if (icon) { icon.classList.add('fly'); setTimeout(() => icon.classList.remove('fly'), 700); }
        const newBal = data.newWallet !== undefined ? data.newWallet : window.myWallet - amount;
        if (typeof window.setWallet === 'function') window.setWallet(newBal);
        if (resultMsg) { resultMsg.className = 'success'; resultMsg.textContent = '💸 ' + amount + ' ETB is on the way!'; resultMsg.style.display = 'block'; }
        if (btn) btn.textContent = 'Done ✓';
        setTimeout(closeWithdrawModal, 2500);
    })
    .catch(() => {
        if (resultMsg) { resultMsg.className = 'error'; resultMsg.textContent = '❌ Network error, try again'; resultMsg.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Withdraw'; }
    });
}

/* ── Gift overlay ── */
export function closeGift5() {
    document.getElementById('giftOverlay5').classList.remove('open');
}

export function claimGift5(type) {
    const btn = document.getElementById(type === 'etb' ? 'claimEtbBtn5' : 'claimXpBtn5');
    if (!btn || btn.disabled) return;
    btn.classList.add('claim-flash5');
    btn.disabled = true;
    btn.textContent = '✓ Claimed';
    setTimeout(() => btn.classList.remove('claim-flash5'), 300);
    if (type === 'etb') window.etbClaimed5 = true;
    else                window.xpClaimed5 = true;
    const tg = window.getTelegramUser ? window.getTelegramUser() : null;
    if (window.etbClaimed5 && window.xpClaimed5) {
        window.giftEndTime5 = Date.now() + (4 * 60 * 60 * 1000);
        const giftBtn = document.getElementById('btnGift5');
        if (giftBtn) giftBtn.classList.remove('ready');
        if (tg && tg.telegram_id) {
            fetch('/api/claim-gift', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({telegram_id: tg.telegram_id}) }).catch(()=>{});
        }
        setTimeout(closeGift5, 800);
    }
}

/* ── Island overlay ── */
export function closeIsland5() {
    document.getElementById('islandOverlay5').classList.remove('open');
}

/* ── Leaderboard modal ── */
export function openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) {
        modal.style.display = 'flex';
        startLeaderboardCountdown();
    }
}

export function closeLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) modal.style.display = 'none';
}

let lbCountdownInterval = null;
function startLeaderboardCountdown() {
    if (lbCountdownInterval) clearInterval(lbCountdownInterval);
    function updateLeaderboardCountdown() {
        const now = new Date();
        const next = new Date();
        next.setHours(12, 0, 0, 0);
        if (now >= next) next.setDate(next.getDate() + 1);
        const diff = next - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const el = document.getElementById('lbCountdown');
        if (el) {
            el.textContent = String(h).padStart(2, '0') + ':' +
                            String(m).padStart(2, '0') + ':' +
                            String(s).padStart(2, '0');
        }
    }
    updateLeaderboardCountdown();
    lbCountdownInterval = setInterval(updateLeaderboardCountdown, 1000);
}

/* ── Theme toggle ── */
export function toggleTheme() {
    const body = document.body;
    const btn  = document.getElementById('themeToggleBtn');
    if (body.getAttribute('data-theme') === 'light') {
        body.removeAttribute('data-theme');
        if (btn) btn.textContent = '🌙';
        try { localStorage.setItem('birr_theme', 'dark'); } catch(e) {}
    } else {
        body.setAttribute('data-theme', 'light');
        if (btn) btn.textContent = '☀️';
        try { localStorage.setItem('birr_theme', 'light'); } catch(e) {}
    }
}

export function initTheme() {
    try {
        const t = localStorage.getItem('birr_theme');
        if (t === 'light') {
            document.body.setAttribute('data-theme', 'light');
            const b = document.getElementById('themeToggleBtn');
            if (b) b.textContent = '☀️';
        }
    } catch(e) {}
}

/* ═══════════════════════════════════════════════
   BINGO CARD MATRIX (B-I-N-G-O 5x5 grid)
   ═══════════════════════════════════════════════
   This was the missing piece behind the "card selected but 5x5 grid
   never shows" bug. app.js had a `getCellNumber()` reader plus three
   near-duplicate grid-building loops (inline preview, chooser-top
   preview, and the in-game card), and every one of them grabbed its
   target element with `document.getElementById(...)` and *immediately*
   wrote to `.innerHTML` with no null-check. If that element id doesn't
   exist yet at the moment a card is clicked (a common side-effect of
   splitting markup/scripts into modules — screens/templates can end up
   attached to the DOM later than the script that reaches for them),
   `grid.innerHTML = ''` throws a plain, uncaught
   "Cannot set properties of null" error and the function bails out
   silently. The 1-90 selector grid still highlights fine because that
   click handler lives in different code — so from the outside it looks
   exactly like "selection works, the 5x5 card just never appears".
   Centralizing the logic here with real guards fixes that failure mode
   and gives every caller one consistent, tested renderer. */

export function getCellNumber(card, row, col) {
    if (!card) return null;
    if (row === 2 && col === 2) return null;
    if (col === 0) return card.b[row];
    if (col === 1) return card.i[row];
    if (col === 2) return row < 2 ? card.n[row] : card.n[row - 1];
    if (col === 3) return card.g[row];
    return card.o[row];
}

/**
 * Populates a 5x5 Bingo card grid under the B-I-N-G-O headers.
 * @param {string} gridElId  id of the container element
 * @param {object} card      card data shape { b:[], i:[], n:[], g:[], o:[] }
 * @param {object} opts
 *   cellClass    - CSS class for each cell (default 'card-cell')
 *   freeText     - text for the center free cell (default 'FREE')
 *   markedCells  - array of already-marked cell indices
 *   onCellClick  - function(cellEl, index, number) called on cell click;
 *                  if omitted, cells are rendered read-only (no listener)
 */
export function renderBingoCardGrid(gridElId, card, opts = {}) {
    const grid = document.getElementById(gridElId);
    if (!grid) {
        console.warn(`[ui-controller] renderBingoCardGrid: no element #${gridElId} in the DOM — card grid was not rendered.`);
        return false;
    }
    if (!card) {
        console.warn('[ui-controller] renderBingoCardGrid: no card data supplied.');
        return false;
    }

    const {
        cellClass   = 'card-cell',
        freeText    = 'FREE',
        markedCells = [],
        onCellClick = null,
    } = opts;

    grid.innerHTML = '';
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const index = row * 5 + col;
            const cell  = document.createElement('div');
            cell.className = cellClass;

            if (row === 2 && col === 2) {
                cell.textContent = freeText;
                cell.classList.add('free', 'marked');
            } else {
                const num = getCellNumber(card, row, col);
                cell.textContent    = num;
                cell.dataset.number = num;
                cell.dataset.index  = index;
                if (markedCells.includes(index)) cell.classList.add('marked');
                if (typeof onCellClick === 'function') {
                    cell.addEventListener('click', () => onCellClick(cell, index, num));
                }
            }
            grid.appendChild(cell);
        }
    }
    return true;
}

/* ── Copy helpers ── */
export function flashDone(btn, label) {
    btn.textContent = label;
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = btn.dataset.orig || 'Copy'; btn.classList.remove('done'); }, 2000);
}

export function dmCopyNum(num, btnId) {
    const clean = num.replace(/\s/g, '');
    const btn = document.getElementById(btnId);
    if (btn) btn.dataset.orig = btn.textContent;
    const doFlash = () => btn && flashDone(btn, '✓ Copied');
    const fallback = () => {
        const el = Object.assign(document.createElement('textarea'), {value: clean});
        el.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(el);
        el.focus(); el.select();
        try { document.execCommand('copy'); doFlash(); } catch(e) {}
        document.body.removeChild(el);
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(clean).then(doFlash).catch(fallback);
    } else { fallback(); }
}

export async function dmPasteClipboard() {
    const btn = document.getElementById('dmPasteBtn');
    const ta  = document.getElementById('depositSmsNew');
    if (btn) btn.dataset.orig = 'Paste';
    if (navigator.clipboard && window.isSecureContext) {
        try {
            const text = await navigator.clipboard.readText();
            if (ta) ta.value = text;
            btn && flashDone(btn, '✓ Pasted');
        } catch(e) {
            if (ta) ta.focus();
            btn && flashDone(btn, '✓ Pasted');
        }
    } else {
        if (ta) ta.focus();
        btn && flashDone(btn, '✓ Pasted');
    }
}

export function dmSwitchTab(tab) {
    const isSms = tab === 'sms';
    document.getElementById('dmTabSms').classList.toggle('active', isSms);
    document.getElementById('dmTabTxn').classList.toggle('active', !isSms);
    document.getElementById('dmPanelSms').classList.toggle('active', isSms);
    document.getElementById('dmPanelTxn').classList.toggle('active', !isSms);
}
