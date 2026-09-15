/* ═══════════════════════════════════════════════
   APP.JS — Entry point, socket wiring, game state
   ═══════════════════════════════════════════════ */

import {
    eyeReactToCall,
    startEyeAnimation,
    stopEyeAnimation,
    eyeLookAt,
} from './modules/eye-animation.js';

import {
    showToast,
    openPendingDrawer,
    closePendingDrawer,
    loadPendingRewards,
    attachBsheetDrag,
    submitDeposit,
    submitWithdraw,
    closeDepositModal,
    closeWithdrawModal,
    closeGift5,
    claimGift5,
    closeIsland5,
    openLeaderboardModal,
    closeLeaderboardModal,
    toggleTheme,
    initTheme,
    dmCopyNum,
    dmPasteClipboard,
    dmSwitchTab,
    flashDone,
    getCellNumber,
    renderBingoCardGrid,
} from './modules/ui-controller.js';

/* ── Globals ── */
let socket         = null;
let mySocketId     = null;
let myName         = '';
let myImageUrl     = '';
let myWallet       = null;
let myXP           = 0;
let myLevel        = 'Beginner';
let myCardIndex    = null;
let allCards       = [];
let takenCards     = {};
let isLocked       = false;
let gamePhase      = 'waiting';
let calledNumbers  = [];
let currentNumber  = null;
let playerCardData = null;
let markedCells    = [];
let visibleCardCount = 400;
let hasPaidThisRound = false;

let userIsTouching  = false;
let callsSinceTouch = 0;
let autoScrollTimer = null;

let countdownMax     = 30;
let countdownCurrent = 30;
let frozenPlayerCount = null;
let localCountdownTimer = null;

let myCard2Index   = null;
let playerCard2Data = null;
let markedCells2   = [];

/* ── Telegram user ── */
function getTelegramUser() {
    try {
        const tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const u = tg.initDataUnsafe.user;
            return {
                telegram_id : String(u.id),
                name        : [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Player',
                username    : u.username || '',
                image_url   : u.photo_url || '',
            };
        }
    } catch(e) {}

    let guestId = localStorage.getItem('bingoGuestId');
    if (!guestId) {
        guestId = 'guest-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
        localStorage.setItem('bingoGuestId', guestId);
    }
    const savedName = localStorage.getItem('bingoGuestName') || 'Player';
    return {
        telegram_id : guestId,
        name        : savedName,
        username    : '',
        image_url   : '',
    };
}

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return 'JB';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'JB';
}

function getColorClass(n) {
    if (n <= 15) return 'called-b';
    if (n <= 30) return 'called-i';
    if (n <= 45) return 'called-n';
    if (n <= 60) return 'called-g';
    return 'called-o';
}

function getLetterForNumber(n) {
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
}

/* getCellNumber now lives in ui-controller.js and is imported above,
   so every card-grid renderer in this file reads cells the same way. */

/* ── Expose API for other modules ── */
window.getTelegramUser = getTelegramUser;
window.showToast = showToast;
window.setWallet = function(w) {
    myWallet = w;
    const wb = document.getElementById('walletBalance'); if (wb) wb.textContent = w + ' ETB';
    const db = document.getElementById('dashBalance');   if (db) db.textContent = w + ' ETB';
};

/* ── Expose all functions called from HTML onclick ── */
window.openDashboard = openDashboard;
window.closeDashboard = closeDashboard;
window.openCard2Chooser = openCard2Chooser;
window.closeCard2Chooser = closeCard2Chooser;
window.ctpHandleAdd2 = ctpHandleAdd2;
window.callBingo = callBingo;
window.returnToLobby = returnToLobby;
window.goToSlide = goToSlide;
window.closePendingDrawer = closePendingDrawer;
window.closeDepositModal = closeDepositModal;
window.closeWithdrawModal = closeWithdrawModal;
window.closeGift5 = closeGift5;
window.claimGift5 = claimGift5;
window.closeIsland5 = closeIsland5;
window.closeLeaderboardModal = closeLeaderboardModal;
window.toggleTheme = toggleTheme;
window.submitDeposit = submitDeposit;
window.submitWithdraw = submitWithdraw;
window.dmCopyNum = dmCopyNum;
window.dmPasteClipboard = dmPasteClipboard;
window.dmSwitchTab = dmSwitchTab;
window.toggleInlinePanel = toggleInlinePanel;
window.dashInvite = dashInvite;
window.dashDeposit = dashDeposit;
window.dashWithdraw = dashWithdraw;
window.dashFilterTime = dashFilterTime;
window.wmSelectProvider = wmSelectProvider;
window.wmSetAmount = wmSetAmount;
window.wmClearChip = wmClearChip;
window.joinRoom = joinRoom;
window.playKeno = function() { closeLeaderboardModal(); window.location.href = '/keno2'; };

/* ═══════════════════════════════════════════════
   CONNECT & JOIN
   ═══════════════════════════════════════════════ */
function connectToServer() {
    socket = io({ path: '/to/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
        document.getElementById('connectOverlay').classList.add('hidden');
        joinGame();
        showWelcomeModal();
    });

    socket.on('disconnect', () => {
        showToast('⚠️ Connection lost. Reconnecting...', '#DC143C');
    });

    socket.on('connect_error', () => {
        showToast('❌ Cannot reach server', '#DC143C');
    });

    socket.on('joined', (data) => {
        mySocketId = data.socketId;
        allCards   = data.allCards;
        const p    = data.player || {};
        myWallet   = p.wallet  !== undefined ? p.wallet : 10;
        myXP       = p.xp     !== undefined ? p.xp    : 0;
        myLevel    = p.level  || 'Beginner';
        myName     = p.name   || myName;
        myImageUrl = p.imageUrl || myImageUrl;
        applyGameState(data.gameState);
        renderUI();
        updateProfileUI();
        refreshLobbyStats();
    });

    socket.on('player_count', ({ count }) => {
        if (frozenPlayerCount === null) {
            document.getElementById('playersCount').textContent = count;
            document.getElementById('gamePlayers').textContent  = count;
        }
    });

    socket.on('phase_change', ({ phase, countdown }) => {
        gamePhase        = phase;
        countdownMax     = countdown;
        countdownCurrent = countdown;
        updatePhaseBadge();
        updateCountdownBar(countdown, countdown);
        renderCardsGrid();
        refreshLobbyStats();
        syncCountdownTimerToPhase();
    });

    socket.on('countdown_tick', ({ countdown }) => {
        countdownCurrent = countdown;
        document.getElementById('headerCountdown').textContent = countdown;
        updateCountdownBar(countdown, countdownMax);
        updatePhaseBadge();

        if (countdown <= 3 && myCardIndex !== null && !isLocked) {
            isLocked = true;
            const ls = document.getElementById('lockStatus');
            if (ls) { ls.textContent = '🔒 Card locked!'; ls.style.color = '#D4A852'; }
            const ctpSub = document.getElementById('ctpCardSub');
            if (ctpSub) ctpSub.textContent = '🔒 Card locked!';
            showToast('🔒 Card locked!', '#50C878');
            renderCardsGrid();
        } else if (!isLocked && myCardIndex !== null) {
            const ls = document.getElementById('lockStatus');
            if (ls) ls.textContent = countdown <= 5 ? `⚠️ Locks in ${countdown}s!` : '✓ Selected — can switch';
            const ctpSub = document.getElementById('ctpCardSub');
            if (ctpSub) ctpSub.textContent = countdown <= 5 ? `⚠️ Locks in ${countdown}s!` : '✓ Selected — can switch';
        }
    });

    socket.on('cards_updated', ({ takenCards: tc, playerCount }) => {
        takenCards = tc;
        if (frozenPlayerCount === null) {
            document.getElementById('playersCount').textContent = playerCount;
            document.getElementById('gamePlayers').textContent  = playerCount;
        }
        renderCardsGrid();
    });

    socket.on('card_selected', ({ cardIndex, myWallet: w }) => {
        myCardIndex = cardIndex;
        if (!hasPaidThisRound) {
            hasPaidThisRound = true;
            myWallet = w;
            const wb = document.getElementById('walletBalance'); if (wb) wb.textContent = `${myWallet} ETB`;
            const db = document.getElementById('dashBalance');   if (db) db.textContent = `${myWallet} ETB`;
        }
        renderCardsGrid();
    });

    socket.on('game_start', ({ playerCount, pot, derash }) => {
        gamePhase = 'playing';
        syncCountdownTimerToPhase();
        frozenPlayerCount = playerCount;
        document.getElementById('gamePlayers').textContent  = playerCount;
        document.getElementById('playersCount').textContent = playerCount;
        document.getElementById('gameDerash').textContent   = derash;

        updateProfileUI();
        document.getElementById('gameProfileName').textContent = myName;

        document.getElementById('cardChooserScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('active');
        generate75NumbersGrid();

        if (myCardIndex !== null) {
            playerCardData = allCards[myCardIndex];
            document.getElementById('gameCardId').textContent = `#${myCardIndex + 1}`;
            setWatchMode(false);
            generatePlayerCard();
        } else {
            setWatchMode(true);
        }
    });

    socket.on('number_called', ({ number, letter, callIndex, calledNumbers: cn }) => {
        calledNumbers = cn;
        currentNumber = number;

        document.querySelectorAll('.current-call').forEach(el => el.classList.remove('current-call'));

        const cell = document.getElementById(`num-${number}`);
        if (cell) cell.classList.add('called', getColorClass(number), 'current-call');

        document.getElementById('gameCallsCount').textContent     = callIndex;
        document.getElementById('currentCallDisplay').textContent = `${letter}-${number}`;

        updateSlidingNumbers(letter, number);
        eyeReactToCall(letter);
        if (myCard2Index !== null) autoMarkCard2(number);
    });

    socket.on('bingo_winner', ({ winner, calledNumbers: cn }) => {
        calledNumbers = cn;
        gamePhase = 'finished';
        syncCountdownTimerToPhase();
        showWinnerScreen(winner);
    });

    socket.on('false_bingo', ({ message }) => {
        showToast(`❌ ${message}`, '#DC143C');
        const btn1 = document.getElementById('bingoBtn1');
        if (btn1) { btn1.textContent = 'NOT YET! 🎯'; btn1.style.background = 'linear-gradient(135deg,#DC143C,#8B0000)'; }
        setTimeout(() => {
            if (btn1) { btn1.textContent = 'BINGO!'; btn1.style.background = 'linear-gradient(135deg,#D4A852,#E8834A)'; }
        }, 1500);
    });

    socket.on('admin_toast', ({ message, color }) => {
        showToast(message, color || '#D4A852');
    });

    socket.on('game_reset', (state) => {
        frozenPlayerCount = null;
        resetLocalState(state);
    });

    socket.on('insufficient_funds', ({ wallet, required }) => {
        showToast(`❌ Insufficient balance! You need ${required} ETB (have ${wallet} ETB)`, '#DC143C');
    });

    socket.on('no_winner', () => {
        gamePhase = 'finished';
        syncCountdownTimerToPhase();
        showToast('🎲 No winner this round!', '#4169E1');
        document.getElementById('gameStatus').textContent = '🎲 No Winner!';
        setTimeout(() => {
            document.getElementById('winnerScreen').classList.remove('active');
        }, 100);
    });

    socket.on('stake_refunded', ({ myWallet: w }) => {
        myWallet = w;
        document.getElementById('walletBalance').textContent  = `${myWallet} ETB`;
        document.getElementById('gameCardId') && (document.getElementById('gameCardId').textContent = `#${myCardIndex + 1}`);
        showToast(`✅ Stake refunded! Balance: ${myWallet} ETB`, '#50C878');
    });

    socket.on('solo_refund', (data) => {
        myWallet = data.newWallet;
        document.getElementById('walletBalance').textContent = `${myWallet} ETB`;
        showToast(data.message, '#D4A852');
    });

    socket.on('solo_retry', (data) => {
        showToast(data.message, '#4169E1');
    });

    socket.on('pending_released', function(data){
        myWallet = data.newWallet;
        window.myPendingBalance = data.newPending;
        document.getElementById('dashBalance').textContent = myWallet + ' ETB';
        document.getElementById('walletBalance').textContent = myWallet + ' ETB';
        var el = document.getElementById('dashPendingAmount');
        if(el) el.textContent = window.myPendingBalance + ' ETB';
        showToast('+' + data.amount + ' ETB released from pending!', '#50C878');
    });

    socket.on('task_auto_claimed', function(data){
        window.myPendingBalance = data.newPending;
        var el = document.getElementById('dashPendingAmount');
        if(el) el.textContent = window.myPendingBalance + ' ETB';
        if(data.pending){
            showToast(data.taskName + ': +' + data.amount + ' ETB pending (24h)', '#E8834A');
        } else {
            myWallet = data.newWallet;
            document.getElementById('dashBalance').textContent = myWallet + ' ETB';
            document.getElementById('walletBalance').textContent = myWallet + ' ETB';
            showToast(data.taskName + ': +' + data.amount + ' ETB added!', '#50C878');
        }
        loadTasks();
    });

    socket.on('joined', function(){
        setTimeout(function(){
            var _tg = getTelegramUser();
            if(!_tg || !_tg.telegram_id) return;
            fetch('/api/pending?telegram_id=' + encodeURIComponent(_tg.telegram_id))
                .then(function(r){return r.json();})
                .then(function(rows){
                    window.myPendingBalance = rows.reduce(function(s,r){return s + r.amount;}, 0);
                    var el = document.getElementById('dashPendingAmount');
                    if(el) el.textContent = window.myPendingBalance + ' ETB';
                }).catch(function(){});
        }, 1000);
    });

    socket.on('card2_data', (data) => {
        playerCard2Data = data.grid;
        if (data.wallet !== undefined) {
            myWallet = data.wallet;
            const w = document.getElementById('walletBalance');
            if (w) w.textContent = `${myWallet} ETB`;
        }
        markedCells2 = [12];
        renderCard2();
    });
}

function joinGame() {
    const user = getTelegramUser();
    myName     = user.name;
    myImageUrl = user.image_url;

    let referralCode = null;
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.expand();
            window.Telegram.WebApp.ready();
            referralCode = window.Telegram.WebApp.initDataUnsafe.start_param || null;
        }
    } catch(e) { console.error("Telegram WebApp error:", e); }

    socket.emit('player_join', {
        telegram_id  : user.telegram_id,
        name         : user.name,
        username     : user.username,
        image_url    : user.image_url,
        referral_code: referralCode
    });
}

/* ═══════════════════════════════════════════════
   UI RENDERING
   ═══════════════════════════════════════════════ */
function updateProfileUI() {
    const avatarHTML = myImageUrl
        ? `<img src="${myImageUrl}" alt="${myName}" onerror="this.parentElement.textContent='${getInitials(myName)}'">`
        : getInitials(myName);

    const pic = document.getElementById('profilePic');
    if (pic) { if (myImageUrl) pic.innerHTML = avatarHTML; else pic.textContent = avatarHTML; }

    const gamePicEl = document.getElementById('gameProfilePic');
    if (gamePicEl) {
        if (myImageUrl) gamePicEl.innerHTML = `<img src="${myImageUrl}" alt="${myName}" onerror="this.parentElement.textContent='${getInitials(myName)}'">`;
        else gamePicEl.textContent = getInitials(myName);
    }

    const pn = document.getElementById('profileName'); if (pn) pn.textContent = myName;
    const pl = document.getElementById('profileLevel'); if (pl) pl.textContent = myXP || 0;
    const wb = document.getElementById('walletBalance'); if (wb) wb.textContent = `${myWallet ?? 0} ETB`;
    const db = document.getElementById('dashBalance'); if (db) db.textContent = `${myWallet ?? 0} ETB`;

    const myAv = document.getElementById('myAvatar');
    if (myAv) { if (myImageUrl) myAv.innerHTML = `<img src="${myImageUrl}" alt="${myName}">`; else myAv.textContent = getInitials(myName); }
}

function applyGameState(state) {
    gamePhase        = state.phase;
    takenCards       = state.takenCards || {};
    countdownCurrent = state.countdown;
    countdownMax     = 30;
    calledNumbers    = state.calledNumbers || [];
    currentNumber    = state.currentNumber;
    document.getElementById('playersCount').textContent    = state.playerCount || 0;
    document.getElementById('headerCountdown').textContent = state.countdown;
    document.getElementById('walletBalance').textContent   = `${myWallet} ETB`;

    if (state.phase === 'playing') {
        document.getElementById('cardChooserScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('active');
        setWatchMode(true);
        generate75NumbersGrid();
    }
    syncCountdownTimerToPhase();
}

function renderUI() {
    updatePhaseBadge();
    renderCardsGrid();
}

/* ── Local countdown ticker ──
   Previously the header countdown only updated inside the
   `countdown_tick` socket handler — i.e. it was 100% dependent on the
   server pushing a tick every single second over the websocket. Any
   gap, delay, or missed emit on the server side (or just normal network
   jitter) left the number frozen on screen with nothing on the client
   ticking it down in between. This runs its own 1-second interval that
   decrements the displayed value locally, and every authoritative
   `countdown_tick` / `phase_change` / game-state event still overwrites
   `countdownCurrent` with the server's real value, so the two can never
   drift apart — the timer just never goes visibly static again. */
function startLocalCountdown() {
    stopLocalCountdown();
    localCountdownTimer = setInterval(() => {
        if (gamePhase !== 'countdown') { stopLocalCountdown(); return; }
        countdownCurrent = Math.max(0, countdownCurrent - 1);
        const cd = document.getElementById('headerCountdown');
        if (cd) cd.textContent = countdownCurrent;
        updateCountdownBar(countdownCurrent, countdownMax);
        updatePhaseBadge();
    }, 1000);
}

function stopLocalCountdown() {
    if (localCountdownTimer) {
        clearInterval(localCountdownTimer);
        localCountdownTimer = null;
    }
}

function syncCountdownTimerToPhase() {
    if (gamePhase === 'countdown') startLocalCountdown();
    else stopLocalCountdown();
}

function updateCountdownBar(current, max) {
    const pct = Math.max(0, (current / max) * 100);
    document.getElementById('countdownBarFill').style.width = `${pct}%`;
}

function updatePhaseBadge() {
    const badge = document.getElementById('chooserBarPhase');
    if (!badge) return;
    if (gamePhase === 'waiting')   badge.textContent = '⏳ Waiting for players…';
    if (gamePhase === 'countdown') badge.textContent = `⏱ Starting in ${countdownCurrent}s — pick your card!`;
    if (gamePhase === 'playing')   badge.textContent = '🎮 Game in progress…';
    if (gamePhase === 'finished')  badge.textContent = '🏆 Round finished!';
    const inner = document.getElementById('chooserTopBarInner');
    if (inner) { inner.style.animation='none'; inner.offsetWidth; inner.style.animation='slideInFromRight 0.45s cubic-bezier(0.22,0.61,0.36,1) both'; }
}

/* ── Cards grid ── */
function renderCardsGrid() {
    const grid = document.getElementById('cardsGrid');
    let takenCount = 0;
    for (let i = 0; i < visibleCardCount; i++) {
        if (takenCards[i] && takenCards[i] !== mySocketId) takenCount++;
    }
    const threshold = Math.floor(visibleCardCount * 0.8);
    if (takenCount >= threshold && visibleCardCount < 1000) {
        const prevCount = visibleCardCount;
        visibleCardCount = Math.min(visibleCardCount + 400, 1000);
        for (let i = prevCount; i < visibleCardCount; i++) {
            const div = _buildCardOption(i);
            div.style.opacity = '0';
            div.style.transform = 'scale(0.8)';
            grid.appendChild(div);
            setTimeout(() => {
                div.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                div.style.opacity = '1';
                div.style.transform = 'scale(1)';
            }, (i - prevCount) * 5);
        }
        if (visibleCardCount < 1000) {
            showToast(`🎴 ${visibleCardCount - prevCount} more cards unlocked!`, '#4169E1');
        }
        _updateExistingCards(grid, prevCount);
        _updateExistingCards(grid, visibleCardCount);
        return;
    }
    grid.innerHTML = '';
    for (let i = 0; i < visibleCardCount; i++) {
        grid.appendChild(_buildCardOption(i));
    }
}

function _buildCardOption(i) {
    const div = document.createElement('div');
    div.className = 'card-option';
    const isTaken   = takenCards[i] && takenCards[i] !== mySocketId;
    const isMine    = takenCards[i] === mySocketId || i === myCardIndex;
    const canSelect = (gamePhase === 'countdown' || gamePhase === 'waiting') && !isLocked && !isTaken;

    if (isTaken) div.classList.add('taken');
    if (isMine)  div.classList.add('my-selection');

    const num = document.createElement('div');
    num.className   = 'card-number';
    num.textContent = `${i + 1}`;
    div.appendChild(num);

    if (canSelect) {
        div.addEventListener('click', () => selectCard(i));
    } else {
        div.style.cursor = isTaken ? 'not-allowed' : 'default';
    }
    return div;
}

function _updateExistingCards(grid, upTo) {
    const children = Array.from(grid.children);
    const limit = Math.min(upTo, children.length);
    for (let i = 0; i < limit; i++) {
        const div     = children[i];
        const isTaken = takenCards[i] && takenCards[i] !== mySocketId;
        const isMine  = takenCards[i] === mySocketId || i === myCardIndex;
        const canSelect = (gamePhase === 'countdown' || gamePhase === 'waiting') && !isLocked && !isTaken;

        div.className = 'card-option';
        if (isTaken) div.classList.add('taken');
        if (isMine)  div.classList.add('my-selection');
        div.style.cursor = canSelect ? 'pointer' : (isTaken ? 'not-allowed' : 'default');

        const clone = div.cloneNode(true);
        if (canSelect) clone.addEventListener('click', () => selectCard(i));
        grid.replaceChild(clone, div);
    }
}

function selectCard(index) {
    if (
        isLocked ||
        (gamePhase !== 'countdown' && gamePhase !== 'waiting') ||
        (gamePhase === 'countdown' && countdownCurrent <= 3)
    ) return;
    if (takenCards[index] && takenCards[index] !== mySocketId) return;
    if (index === myCardIndex) return;

    if (myWallet !== null && myWallet < 10) {
        dashDeposit();
        setTimeout(() => {
            const dmBox = document.getElementById('dmBox');
            if (dmBox && !document.getElementById('dmInsufficientBanner')) {
                const banner = document.createElement('div');
                banner.id = 'dmInsufficientBanner';
                banner.style.cssText = `
                    background: linear-gradient(135deg, #DC143C22, #8B000033);
                    border: 1px solid #DC143C88;
                    border-radius: 10px;
                    padding: 10px 14px;
                    margin-bottom: 12px;
                    color: #FF6B6B;
                    font-size: 13px;
                    font-weight: 700;
                    text-align: center;
                    letter-spacing: 0.3px;
                `;
                banner.innerHTML = `⚠️ You need at least <span style="color:#D4A852">10 ETB</span> to join a game. Deposit to continue.`;
                dmBox.insertBefore(banner, dmBox.firstChild);
            }
        }, 50);
        return;
    }

    myCardIndex = index;
    showInlinePreview(index);
    showChooserTopPreview(index);
    document.getElementById('cardsSection').classList.add('card-selected');
    document.getElementById('previewSection').classList.add('active');
    document.getElementById('previewSectionTitle').textContent = `Card #${index + 1}`;
    document.getElementById('previewCardId').textContent       = `Card #${index + 1}`;

    socket.emit('select_card', { cardIndex: index });
    renderCardsGrid();
}

function showInlinePreview(index) {
    const card = allCards[index];
    if (!card) {
        console.warn(`[app] showInlinePreview: no card data for index ${index} (allCards length: ${allCards.length}).`);
        return;
    }
    renderBingoCardGrid('inlinePreviewGrid', card, { cellClass: 'inline-preview-cell' });
}

function showChooserTopPreview(index) {
    const card = allCards[index];
    if (!card) {
        console.warn(`[app] showChooserTopPreview: no card data for index ${index} (allCards length: ${allCards.length}).`);
        return;
    }
    const bar   = document.getElementById('chooserTopPreview');
    const label = document.getElementById('ctpCardLabel');
    const sub   = document.getElementById('ctpCardSub');

    renderBingoCardGrid('ctpMiniGrid', card, { cellClass: 'ctp-mini-cell', freeText: '★' });

    label.textContent = `Card #${index + 1}`;
    sub.textContent   = '✓ Selected — can switch';

    const btn = document.getElementById('ctpAdd2Btn');
    if (myCard2Index !== null) {
        btn.className = 'ctp-add2-btn has-card2';
        btn.innerHTML = `✓ Card 2 Added<br><span style="font-size:0.85em;opacity:0.85">#${myCard2Index + 1}</span>`;
    } else {
        btn.className = 'ctp-add2-btn';
        btn.innerHTML = `＋ Add Card 2<br><span style="font-size:0.85em;opacity:0.85">+10 ETB</span>`;
    }

    bar.classList.add('visible');
}

function ctpHandleAdd2() {
    if (myCardIndex === null) return;
    openCard2Chooser();
}

/* ═══════════════════════════════════════════════
   WATCH MODE
   ═══════════════════════════════════════════════ */
function setWatchMode(watching) {
    const bingoBtn  = document.querySelector('.bingo-button');
    const cardGrid  = document.getElementById('bingoCard');
    const statusEl  = document.getElementById('gameStatus');
    const cardIdEl  = document.getElementById('gameCardId');
    const eyes      = document.getElementById('watchModeEyes');
    const cardCont  = document.querySelector('.card-grid-container');

    if (watching) {
        if (bingoBtn)  bingoBtn.style.display  = 'none';
        if (cardGrid)  cardGrid.style.display  = 'none';
        if (statusEl)  statusEl.textContent    = '👁 Watching';
        if (cardIdEl)  cardIdEl.textContent    = '—';
        if (eyes)      eyes.classList.add('active');
        const cardWith = document.querySelector('.card-with-header');
        if (cardWith) cardWith.style.display = 'none';
        startEyeAnimation();
    } else {
        if (bingoBtn)  bingoBtn.style.display  = '';
        if (cardGrid)  cardGrid.style.display  = '';
        if (statusEl)  statusEl.textContent    = 'GAME IN PROGRESS';
        if (eyes)      eyes.classList.remove('active');
        const cardWith = document.querySelector('.card-with-header');
        if (cardWith) cardWith.style.display = '';
        stopEyeAnimation();
    }
}

function generate75NumbersGrid() {
    const grid = document.getElementById('allNumbersGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        const cell = document.createElement('div');
        cell.className   = 'number-cell-small';
        cell.textContent = i;
        cell.id          = `num-${i}`;
        grid.appendChild(cell);
    }
    calledNumbers.forEach(n => {
        const c = document.getElementById(`num-${n}`);
        if (c) c.classList.add('called', getColorClass(n));
    });
}

function generatePlayerCard() {
    const card = playerCardData;
    if (!card) {
        console.warn('[app] generatePlayerCard: playerCardData is not set — nothing to render.');
        return;
    }
    markedCells = [12];

    renderBingoCardGrid('bingoCard', card, {
        cellClass: 'card-cell',
        markedCells,
        onCellClick: (cell, idx) => {
            cell.classList.toggle('marked');
            if (cell.classList.contains('marked')) {
                markedCells.push(idx);
            } else {
                markedCells = markedCells.filter(i => i !== idx);
            }
            socket.emit('mark_cell', { cellIndex: idx });
        },
    });
}

function updateSlidingNumbers(letter, number) {
    const slider = document.getElementById('numberSlider');
    const div    = document.createElement('div');
    div.className   = 'slider-number';
    div.textContent = `${letter}${number}`;
    slider.appendChild(div);

    while (slider.children.length > 15) slider.removeChild(slider.firstChild);

    if (!userIsTouching) {
        callsSinceTouch++;
        if (callsSinceTouch >= 3) { scrollToNewest(); callsSinceTouch = 0; }
        else {
            if (autoScrollTimer) clearTimeout(autoScrollTimer);
            autoScrollTimer = setTimeout(() => { scrollToNewest(); callsSinceTouch = 0; }, 3000);
        }
    }
}

function scrollToNewest() {
    const sw = document.getElementById('swipeMiddle');
    sw.scrollTo({ left: sw.scrollWidth, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════
   BINGO
   ═══════════════════════════════════════════════ */
function callBingo(cardNum) {
    if (gamePhase !== 'playing') return;
    if (cardNum === 2) {
        if (myCard2Index === null) return;
        socket.emit('claim_bingo', { cardIndex: myCard2Index });
    } else {
        socket.emit('claim_bingo');
    }
}

/* ═══════════════════════════════════════════════
   CARD 2
   ═══════════════════════════════════════════════ */
function openCard2Chooser() {
    if (gamePhase !== 'waiting' && gamePhase !== 'countdown') {
        showToast('Can only add 2nd card before game starts', '#E8834A');
        return;
    }
    const overlay = document.getElementById('card2ChooserOverlay');
    const grid    = document.getElementById('card2Grid');
    overlay.style.display = 'flex';
    grid.innerHTML = '';
    for (let i = 0; i < Math.min(visibleCardCount, allCards.length); i++) {
        const div = document.createElement('div');
        const taken = takenCards[i] && takenCards[i] !== mySocketId;
        const isMine1 = i === myCardIndex;
        const isMine2 = i === myCard2Index;
        div.className = 'card-option' + (taken ? ' taken' : isMine2 ? ' my-selection' : '');
        if (isMine1) { div.style.opacity = '0.3'; div.style.cursor = 'not-allowed'; }
        div.innerHTML = `<span class="card-number">${i + 1}</span>`;
        if (!taken && !isMine1) {
            div.onclick = () => selectCard2(i);
        }
        grid.appendChild(div);
    }
}

function closeCard2Chooser() {
    document.getElementById('card2ChooserOverlay').style.display = 'none';
}

function selectCard2(idx) {
    if (myWallet < 10) { showToast('Insufficient funds for 2nd card (need 10 ETB)', '#FF3D71'); closeCard2Chooser(); return; }
    myCard2Index = idx;
    closeCard2Chooser();
    socket.emit('select_card2', { cardIndex: idx });
    const empty   = document.getElementById('card2Empty');
    const content = document.getElementById('card2Content');
    const label   = document.getElementById('card2Label');
    const slot    = document.getElementById('cardSlot2');
    if (empty)   empty.style.display   = 'none';
    if (content) content.style.display = 'flex';
    if (label)   label.textContent     = `CARD ${idx + 1}`;
    if (slot)    slot.classList.add('active-slot');
    const btn2 = document.getElementById('bingoBtn2');
    if (btn2) { btn2.disabled = false; btn2.style.opacity = '1'; }
    markedCells2 = [12];
    if (!playerCard2Data && allCards[idx]) {
        playerCard2Data = allCards[idx];
        myWallet = Math.max(0, myWallet - 10);
        const w = document.getElementById('walletBalance');
        if (w) w.textContent = `${myWallet} ETB`;
    }
    const dualWrap = document.querySelector('.dual-card-wrapper');
    if (dualWrap) dualWrap.classList.add('has-card2');
    const ctpBtn = document.getElementById('ctpAdd2Btn');
    if (ctpBtn) {
        ctpBtn.className = 'ctp-add2-btn has-card2';
        ctpBtn.innerHTML = `✓ Card 2 Added<br><span style="font-size:0.85em;opacity:0.85">#${idx + 1}</span>`;
    }
    renderCard2();
    showToast(`Card #${idx + 1} added! −10 ETB charged`, '#50C878');
}

function renderCard2() {
    if (!playerCard2Data || myCard2Index === null) return;
    renderBingoCardGrid('bingoCard2', playerCard2Data, {
        cellClass: 'card-cell',
        markedCells: markedCells2,
        onCellClick: (cell, idx, num) => {
            if (!calledNumbers.includes(num)) return;
            cell.classList.toggle('marked');
            if (cell.classList.contains('marked')) {
                if (!markedCells2.includes(idx)) markedCells2.push(idx);
            } else {
                markedCells2 = markedCells2.filter(x => x !== idx);
            }
        },
    });
}

function autoMarkCard2(num) {
    if (!playerCard2Data) return;
    const card = playerCard2Data;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            if (row === 2 && col === 2) continue;
            if (getCellNumber(card, row, col) === num) {
                const idx = row * 5 + col;
                if (!markedCells2.includes(idx)) markedCells2.push(idx);
            }
        }
    }
    renderCard2();
}

/* ═══════════════════════════════════════════════
   LOBBY STATS
   ═══════════════════════════════════════════════ */
function refreshLobbyStats() {
    fetch('/admin/live').then(r => { if (!r.ok) throw new Error('no server'); return r.json(); }).then(s => {
        const pc  = document.getElementById('r1PlayerCount');
        const pot = document.getElementById('r1Pot');
        const ph  = document.getElementById('r1Phase');
        if (pc)  pc.textContent  = s.playerCount ?? '—';
        if (pot) pot.textContent = (s.pot ?? 0) + ' ETB';
        if (ph)  ph.textContent  = (s.phase || 'WAITING').toUpperCase();
        const sp  = document.getElementById('lobbyStripPlayers');
        const spt = document.getElementById('lobbyStripPot');
        const sph = document.getElementById('lobbyStripPhase');
        if (sp)  sp.textContent  = s.playerCount ?? '—';
        if (spt) spt.textContent = (s.pot ?? 0) + ' ETB';
        if (sph) sph.textContent = (s.phase || 'WAITING').toUpperCase();
    }).catch(() => {
        const sp  = document.getElementById('lobbyStripPlayers');
        const spt = document.getElementById('lobbyStripPot');
        const sph = document.getElementById('lobbyStripPhase');
        if (sp)  sp.textContent  = typeof frozenPlayerCount === 'number' ? frozenPlayerCount : (Object.keys(takenCards).length || '—');
        if (spt) spt.textContent = '—';
        if (sph) sph.textContent = (gamePhase || 'WAITING').toUpperCase();
        const pc  = document.getElementById('r1PlayerCount');
        const pot = document.getElementById('r1Pot');
        const ph  = document.getElementById('r1Phase');
        if (pc)  pc.textContent  = '—';
        if (pot) pot.textContent = '— ETB';
        if (ph)  ph.textContent  = 'WAITING';
    });
}

function joinRoom(roomId) {
    closeDashboard();
}

let lobbyStatsTimer = null;

/* ═══════════════════════════════════════════════
   WINNER SCREEN
   ═══════════════════════════════════════════════ */
function showWinnerScreen(winner) {
    document.getElementById('winnerName').textContent  = winner.name;
    document.getElementById('winnerPrize').textContent = `+${winner.prize} ETB`;
    document.getElementById('winnerCardNum').textContent = `Card #${winner.cardIndex + 1}`;

    const winAv = document.getElementById('winnerAvatar');
    if (winner.imageUrl) {
        winAv.innerHTML = `<img src="${winner.imageUrl}" alt="${winner.name}">`;
    } else {
        winAv.textContent = getInitials(winner.name);
    }

    renderWinnerCard(winner.card, winner.winPattern);
    renderMyCard();
    const myCardNumEl = document.getElementById('myCardNum');
    if (myCardNumEl) myCardNumEl.textContent = myCardIndex !== null ? `Card #${myCardIndex + 1} · Better luck next time! 🎯` : 'Better luck next time! 🎯';

    if (winner.socketId === mySocketId) {
        myWallet += winner.prize;
        showToast(`🏆 YOU WON ${winner.prize} ETB!`, '#50C878');
        document.getElementById('walletBalance').textContent = `${myWallet} ETB`;
    }

    document.getElementById('winnerScreen').classList.add('active');
    setTimeout(() => goToSlide(1), 5000);
}

function renderWinnerCard(card, winPattern) {
    const grid = document.getElementById('winnerCardGrid');
    grid.innerHTML = '';
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell  = document.createElement('div');
            const index = row * 5 + col;
            cell.className = 'winner-cell';
            if (row === 2 && col === 2) {
                cell.textContent = 'FREE';
                cell.classList.add('free');
                if (winPattern.includes(index)) cell.classList.add('winning');
            } else {
                cell.textContent = getCellNumber(card, row, col);
                if (winPattern.includes(index)) cell.classList.add('winning');
            }
            grid.appendChild(cell);
        }
    }
}

function renderMyCard() {
    const grid = document.getElementById('myUnfinishedCard');
    grid.innerHTML = '';
    const card = playerCardData || (myCardIndex !== null ? allCards[myCardIndex] : null);
    if (!card) return;

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell  = document.createElement('div');
            const index = row * 5 + col;
            cell.className = 'winner-cell';
            if (row === 2 && col === 2) {
                cell.textContent = 'FREE';
                cell.classList.add('free', 'winning');
            } else {
                cell.textContent = getCellNumber(card, row, col);
                if (markedCells.includes(index)) cell.classList.add('marked-only');
            }
            grid.appendChild(cell);
        }
    }
}

function goToSlide(index) {
    document.getElementById('winnerSlides').classList.toggle('show-card', index === 1);
    document.querySelectorAll('#winnerScreen .slide-dots').forEach(group => {
        Array.from(group.children).forEach((dot, i) => dot.classList.toggle('active', i === index));
    });
}

/* ═══════════════════════════════════════════════
   RESET
   ═══════════════════════════════════════════════ */
function resetLocalState(state) {
    gamePhase        = state.phase;
    countdownCurrent = state.countdown;
    countdownMax     = 30;
    syncCountdownTimerToPhase();
    takenCards       = state.takenCards || {};
    calledNumbers    = [];
    currentNumber    = null;
    myCardIndex      = null;
    isLocked         = false;
    markedCells      = [];
    playerCardData   = null;
    visibleCardCount = 400;
    hasPaidThisRound = false;
    myCard2Index    = null;
    playerCard2Data = null;
    markedCells2    = [];
    const c2empty   = document.getElementById('card2Empty');
    const c2content = document.getElementById('card2Content');
    const c2label   = document.getElementById('card2Label');
    const slot2     = document.getElementById('cardSlot2');
    if (c2empty)   { c2empty.style.display = 'flex'; }
    if (c2content) { c2content.style.display = 'none'; }
    if (c2label)   { c2label.textContent = 'CARD 2'; }
    if (slot2)     { slot2.classList.remove('active-slot'); }
    const btn2 = document.getElementById('bingoBtn2');
    if (btn2)      { btn2.disabled = true; btn2.style.opacity = '0.25'; }

    document.getElementById('winnerScreen').classList.remove('active');
    document.getElementById('winnerSlides').classList.remove('show-card');
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('cardChooserScreen').classList.add('active');
    document.getElementById('cardsSection').classList.remove('card-selected');
    document.getElementById('previewSection').classList.remove('active');
    const topBar = document.getElementById('chooserTopPreview');
    if (topBar) topBar.classList.remove('visible');
    const ctpBtn = document.getElementById('ctpAdd2Btn');
    if (ctpBtn) { ctpBtn.className = 'ctp-add2-btn'; ctpBtn.innerHTML = `＋ Add Card 2<br><span style="font-size:0.85em;opacity:0.85">+10 ETB</span>`; }
    const dualWrap = document.querySelector('.dual-card-wrapper');
    if (dualWrap) dualWrap.classList.remove('has-card2');
    setWatchMode(false);
    stopEyeAnimation();
    document.getElementById('numberSlider').innerHTML      = '';
    document.getElementById('gameCallsCount').textContent  = '0';
    document.getElementById('walletBalance').textContent   = `${myWallet} ETB`;
    document.getElementById('headerCountdown').textContent = state.countdown;
    const ls = document.getElementById('lockStatus');
    if (ls) { ls.textContent = '✓ Selected — can switch'; ls.style.color = '#50C878'; }
    updateCountdownBar(state.countdown, 30);
    updatePhaseBadge();
    renderCardsGrid();
}

function returnToLobby() {
    document.getElementById('winnerScreen').classList.remove('active');
}

/* ═══════════════════════════════════════════════
   SWIPE DETECTION
   ═══════════════════════════════════════════════ */
function setupSwipeDetection() {
    const sw = document.getElementById('swipeMiddle');
    const setTouching = (v) => {
        userIsTouching = v;
        if (!v) return;
        callsSinceTouch = 0;
        if (autoScrollTimer) { clearTimeout(autoScrollTimer); autoScrollTimer = null; }
    };
    sw.addEventListener('touchstart', () => setTouching(true));
    sw.addEventListener('touchend',   () => setTouching(false));
    sw.addEventListener('mousedown',  () => setTouching(true));
    sw.addEventListener('mouseup',    () => setTouching(false));
}

/* ═══════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════ */
const DASH_PRIZES = {
    '3d':  {1:250,2:130,3:80,4:50,5:30},
    '10d': {1:800,2:400,3:200,4:100,5:60}
};

let dashTimePeriod = '3d';
let dashGiftSecs  = 8 * 60 * 60;
let dashGiftTimer = null;
const dashMaxXP   = 120;

function openDashboard() {
    initDashLobbyRooms();
    dashUpdateProfile();
    dashUpdateXP();
    dashFetchLeaderboard();
    dashStartGiftCountdown();
    if (typeof loadTasks === 'function') loadTasks();
    refreshLobbyStats();
    lobbyStatsTimer = setInterval(refreshLobbyStats, 6000);
    document.getElementById('dashboardOverlay').classList.add('open');
}

function closeDashboard() {
    document.getElementById('dashboardOverlay').classList.remove('open');
    if (dashGiftTimer) { clearInterval(dashGiftTimer); dashGiftTimer = null; }
    if (lobbyStatsTimer) { clearInterval(lobbyStatsTimer); lobbyStatsTimer = null; }
}

function dashUpdateProfile() {
    const _name = document.getElementById('dashProfileName');
    const _lvl  = document.getElementById('dashLevel');
    const _bal  = document.getElementById('dashBalance');
    const _myNm = document.getElementById('dashMyName');
    if (_name) _name.textContent = myName || 'Player';
    if (_lvl)  _lvl.textContent  = myLevel || 'Beginner';
    if (_bal)  _bal.textContent  = `${myWallet ?? 0} ETB`;
    if (_myNm) _myNm.textContent = myName || 'You';

    const pic = document.getElementById('dashProfilePic');
    if (pic) {
        if (myImageUrl) {
            pic.innerHTML = `<img src="${myImageUrl}" alt="${myName}" onerror="this.parentElement.textContent='${getInitials(myName)}'">`;
        } else {
            pic.textContent = getInitials(myName);
        }
    }

    const myPh = document.getElementById('dashMyPhoto');
    if (myPh) {
        if (myImageUrl) {
            myPh.innerHTML = `<img src="${myImageUrl}" alt="${myName}">`;
        } else {
            myPh.textContent = getInitials(myName);
        }
    }
}

function dashUpdateXP() {
    const xp       = myXP || 0;
    const progress = xp % dashMaxXP;
    const pct      = Math.min((progress / dashMaxXP) * 100, 100);
    const _xpNum  = document.getElementById('dashXpNumber');
    const _xpBar  = document.getElementById('dashXpBar');
    const _xpTxt  = document.getElementById('dashXpText');
    const _myScr  = document.getElementById('dashMyScore');
    if (_xpNum) _xpNum.textContent   = `${xp} XP`;
    if (_xpBar) _xpBar.style.width   = `${pct}%`;
    if (_xpTxt) _xpTxt.textContent   = `${progress}/${dashMaxXP}`;
    if (_myScr) _myScr.textContent   = `${xp} XP`;

    const giftIcon = document.getElementById('dashGiftIcon');
    const giftBtn  = document.getElementById('dashGiftBtn');
    if (progress >= dashMaxXP) {
        if (giftIcon) giftIcon.classList.add('ready');
        if (giftBtn)  giftBtn.classList.add('d-gift-ready');
    } else {
        if (giftIcon) giftIcon.classList.remove('ready');
        if (giftBtn)  giftBtn.classList.remove('d-gift-ready');
    }
}

function dashStartGiftCountdown() {
    if (dashGiftTimer) clearInterval(dashGiftTimer);
    dashGiftTimer = setInterval(() => {
        const cdEl  = document.getElementById('dashGiftCountdown');
        const btnEl = document.getElementById('dashGiftBtn');
        if (dashGiftSecs <= 0) {
            if (cdEl)  cdEl.textContent = 'READY! 🎁';
            if (btnEl) btnEl.classList.add('d-gift-ready');
            clearInterval(dashGiftTimer);
            return;
        }
        dashGiftSecs--;
        const h = Math.floor(dashGiftSecs/3600);
        const m = Math.floor((dashGiftSecs%3600)/60);
        const s = dashGiftSecs%60;
        if (cdEl) cdEl.textContent =
            `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

async function dashFetchLeaderboard() {
    try {
        const res  = await fetch('/api/referral-leaderboard?period=' + dashTimePeriod);
        const data = await res.json();
        dashRenderReferralLB(data);
    } catch(e) {
        dashRenderReferralLB([
            {name:'Meron B.',  invitees:12, deposited:9},
            {name:'Haile T.',  invitees:8,  deposited:7},
            {name:'Tigist G.', invitees:7,  deposited:5},
            {name:'Dawit K.',  invitees:5,  deposited:4},
            {name:'Selam Y.',  invitees:4,  deposited:3},
        ]);
    }
}

function dashRenderReferralLB(data) {
    const list = document.getElementById('dashLbList');
    list.innerHTML = '';
    const sorted = [...data].sort((a,b) => (b.deposited - a.deposited) || (b.invitees - a.invitees));

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:grid;grid-template-columns:32px 1fr 44px 60px;gap:6px;padding:6px 10px 4px;font-size:clamp(8px,1.1vh,10px);color:rgba(212,168,82,0.55);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(212,168,82,0.1);margin-bottom:4px;';
    hdr.innerHTML = '<div>#</div><div>Name</div><div style="text-align:center">Inv</div><div style="text-align:center">Deposited</div>';
    list.appendChild(hdr);

    let myRank = '—';
    sorted.forEach((p, idx) => {
        const rank  = idx + 1;
        const item  = document.createElement('div');
        item.style.cssText = 'display:grid;grid-template-columns:32px 1fr 44px 60px;gap:6px;align-items:center;padding:7px 10px;border-radius:8px;margin-bottom:2px;' +
            (rank===1 ? 'background:rgba(212,168,82,0.1);border:1px solid rgba(212,168,82,0.25);' :
             rank===2 ? 'background:rgba(192,192,192,0.07);border:1px solid rgba(192,192,192,0.15);' :
             rank===3 ? 'background:rgba(205,127,50,0.07);border:1px solid rgba(205,127,50,0.15);' :
             p.name===myName ? 'background:rgba(80,200,120,0.06);border:1px dashed rgba(80,200,120,0.25);' :
             'background:rgba(255,255,255,0.02);');

        const rankTxt = rank===1 ? '🥇' : rank===2 ? '🥈' : rank===3 ? '🥉' : '#'+rank;
        const rankColor = rank===1?'#D4A852':rank===2?'#C0C0C0':rank===3?'#CD7F32':'#A08060';

        item.innerHTML =
            `<div style="font-size:${rank<=3?'15px':'clamp(10px,1.5vh,12px)'};font-weight:800;color:${rankColor};text-align:center;">${rankTxt}</div>`+
            `<div style="font-size:clamp(11px,1.6vh,13px);font-weight:600;color:#E8E0D0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name||'Unknown'}${p.name===myName?' <span style="color:#50C878;font-size:9px">(You)</span>':''}</div>`+
            `<div style="text-align:center;font-size:clamp(11px,1.6vh,13px);font-weight:700;color:#C4A882;">${p.invitees||0}</div>`+
            `<div style="text-align:center;font-size:clamp(11px,1.6vh,13px);font-weight:800;color:#D4A852;">${p.deposited||0}</div>`;

        list.appendChild(item);
        if (p.name === myName) myRank = rank;
    });

    const myRankEl = document.getElementById('dashMyRank');
    if (myRankEl) myRankEl.textContent = myRank !== '—' ? '#'+myRank : '—';

    const myScoreEl = document.getElementById('dashMyScore');
    const me = sorted.find(p => p.name === myName);
    if (myScoreEl) myScoreEl.textContent = me ? (me.deposited||0)+' dep.' : '0 dep.';
}

function dashFilterTime(el, period) {
    dashTimePeriod = period;
    document.querySelectorAll('.d-time-filter').forEach(f => f.classList.remove('active'));
    if (el) el.classList.add('active');
    dashFetchLeaderboard();
}

/* ── Inline panel (deposit/withdraw/invite) ── */
let _inlinePanelActive = null;

function toggleInlinePanel(type) {
  const panel = document.getElementById('inlinePanel');
  const btnD  = document.getElementById('btnDepositInline');
  const btnW  = document.getElementById('btnWithdrawInline');
  const btnI  = document.getElementById('btnInviteInline');
  if (!panel) return;

  if (_inlinePanelActive === type) {
    panel.style.maxHeight = '0';
    panel.innerHTML = '';
    _inlinePanelActive = null;
    if (btnD) { btnD.style.background='rgba(80,200,120,0.1)'; btnD.style.borderColor='rgba(80,200,120,0.35)'; }
    if (btnW) { btnW.style.background='rgba(232,131,74,0.1)'; btnW.style.borderColor='rgba(232,131,74,0.35)'; }
    if (btnI) { btnI.style.background='rgba(212,168,82,0.1)'; btnI.style.borderColor='rgba(212,168,82,0.35)'; }
    return;
  }
  _inlinePanelActive = type;

  if (btnD) { btnD.style.background = type==='deposit' ? 'rgba(80,200,120,0.22)' : 'rgba(80,200,120,0.1)'; btnD.style.borderColor = type==='deposit' ? '#50C878' : 'rgba(80,200,120,0.35)'; }
  if (btnW) { btnW.style.background = type==='withdraw' ? 'rgba(232,131,74,0.22)' : 'rgba(232,131,74,0.1)'; btnW.style.borderColor = type==='withdraw' ? '#E8834A' : 'rgba(232,131,74,0.35)'; }
  if (btnI) { btnI.style.background = type==='invite' ? 'rgba(212,168,82,0.22)' : 'rgba(212,168,82,0.1)'; btnI.style.borderColor = type==='invite' ? '#D4A852' : 'rgba(212,168,82,0.35)'; }

  if (type === 'invite') {
    const _tg = getTelegramUser();
    panel.innerHTML = `<div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(212,168,82,0.18);text-align:center;color:#A08060;font-size:13px;">Loading...</div>`;
    panel.style.maxHeight = '600px';
    if (!_tg || !_tg.telegram_id) {
      panel.innerHTML = `<div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(212,168,82,0.18);">
        <div style="font-size:clamp(13px,1.9vh,16px);font-weight:800;color:#D4A852;margin-bottom:1.2vh;">💌 Invite Friends</div>
        <div style="color:#A08060;font-size:13px;padding:1vh 0;">Please open via Telegram to get your referral link.</div>
      </div>`;
      return;
    }
    fetch('/api/referral-info?telegram_id=' + encodeURIComponent(_tg.telegram_id))
      .then(r => r.json())
      .then(data => {
        const refLink = 'https://t.me/mygamezbot/bingo?startapp=' + (data.referralCode || _tg.telegram_id);
        panel.innerHTML = `
          <div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(212,168,82,0.18);">
            <div style="font-size:clamp(13px,1.9vh,16px);font-weight:800;color:#D4A852;margin-bottom:1.2vh;">💌 Invite Friends</div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <input style="flex:1;padding:9px 12px;background:#1c1c1c;border:1.5px solid rgba(212,168,82,0.28);border-radius:10px;color:#F5ECD8;font-size:12px;font-family:'Courier New',monospace;" value="${refLink}" readonly id="inlineInvLink">
              <button onclick="(()=>{const i=document.getElementById('inlineInvLink');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);this.textContent='✓';setTimeout(()=>this.textContent='Copy',2000);})()" style="padding:9px 14px;background:linear-gradient(135deg,#D4A852,#E8834A);border:none;border-radius:10px;color:#2A1F35;font-size:12px;font-weight:800;cursor:pointer;">Copy</button>
              <button onclick="window.open('https://t.me/share/url?url='+encodeURIComponent('${refLink}')+'&text='+encodeURIComponent('Join My Bingo and earn 20 ETB!'),'_blank')" style="padding:9px 14px;background:rgba(26,111,255,0.15);border:1px solid rgba(26,111,255,0.4);border-radius:10px;color:#4d8fff;font-size:12px;font-weight:800;cursor:pointer;">Send</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px;">
              <div style="background:rgba(212,168,82,0.04);border:1px solid rgba(212,168,82,0.15);border-radius:12px;padding:10px 12px;">
                <div style="font-size:18px;font-weight:900;color:#D4A852;">${data.children||0}</div>
                <div style="font-size:10px;color:#8B6A50;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Children</div>
              </div>
              <div style="background:rgba(212,168,82,0.04);border:1px solid rgba(212,168,82,0.15);border-radius:12px;padding:10px 12px;">
                <div style="font-size:18px;font-weight:900;color:#D4A852;">${data.etbEarned||0} ETB</div>
                <div style="font-size:10px;color:#8B6A50;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">ETB Earned</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
              <button onclick="toggleInlinePanel('invite')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:#A08060;font-size:13px;font-weight:700;cursor:pointer;">Close</button>
            </div>
          </div>`;
      })
      .catch(() => {
        const refLink = 'https://t.me/mygamezbot/bingo?startapp=' + _tg.telegram_id;
        panel.innerHTML = `
          <div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(212,168,82,0.18);">
            <div style="font-size:clamp(13px,1.9vh,16px);font-weight:800;color:#D4A852;margin-bottom:1.2vh;">💌 Invite Friends</div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <input style="flex:1;padding:9px 12px;background:#1c1c1c;border:1.5px solid rgba(212,168,82,0.28);border-radius:10px;color:#F5ECD8;font-size:12px;font-family:'Courier New',monospace;" value="${refLink}" readonly id="inlineInvLink">
              <button onclick="(()=>{const i=document.getElementById('inlineInvLink');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);this.textContent='✓';setTimeout(()=>this.textContent='Copy',2000);})()" style="padding:9px 14px;background:linear-gradient(135deg,#D4A852,#E8834A);border:none;border-radius:10px;color:#2A1F35;font-size:12px;font-weight:800;cursor:pointer;">Copy</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
              <button onclick="toggleInlinePanel('invite')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:#A08060;font-size:13px;font-weight:700;cursor:pointer;">Close</button>
            </div>
          </div>`;
      });
    return;
  }

  if (type === 'deposit') {
    panel.innerHTML = `
      <div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(80,200,120,0.18);">
        <div style="font-size:clamp(13px,1.9vh,16px);font-weight:800;color:#50C878;margin-bottom:1.2vh;display:flex;align-items:center;gap:1.5vw;">⬇️ Deposit</div>
        <span id="dmBag" style="font-size:22px;text-align:center;display:block;margin-bottom:6px">💰</span>
        <div class="dm-contact" onclick="dmCopyNum('0982856955','dmCopyTele')" style="margin-bottom:0.7vh;">
          <div class="dm-contact-body">
            <div class="dm-label-row"><span class="dm-provider-tag telebirr">Telebirr</span><span class="dm-number">09 8285 6955</span></div>
          </div>
          <button class="dm-copy-btn" id="dmCopyTele">Copy</button>
        </div>
        <div class="dm-contact" onclick="dmCopyNum('1000096491523','dmCopyCBE')">
          <div class="dm-contact-body">
            <div class="dm-label-row"><span class="dm-provider-tag cbe">CBE</span><span class="dm-number">1000096491523</span></div>
          </div>
          <button class="dm-copy-btn" id="dmCopyCBE">Copy</button>
        </div>
        <div class="dm-tabs" style="margin-top:1vh;">
          <div class="dm-tab active" id="dmTabSms" onclick="dmSwitchTab('sms')">Paste SMS</div>
          <div class="dm-tab" id="dmTabTxn" onclick="dmSwitchTab('txn')">Txn ID</div>
        </div>
        <div class="dm-panel active" id="dmPanelSms">
          <textarea id="depositSmsNew" placeholder="Paste your bank SMS here..." style="width:100%;box-sizing:border-box;resize:none;height:70px;background:rgba(80,200,120,0.05);border:1px solid rgba(80,200,120,0.25);border-radius:10px;color:#E8E0D0;padding:8px;font-size:13px;margin-bottom:6px;"></textarea>
          <button class="dm-gold-btn" id="dmPasteBtn" onclick="dmPasteClipboard()" style="width:100%;margin-bottom:6px;">Paste</button>
        </div>
        <div class="dm-panel" id="dmPanelTxn">
          <label class="dm-field-label">Txn ID (Transaction number)</label>
          <input type="text" id="depositTxnIdNew" placeholder="e.g. DB5715C9PZF" style="width:100%;box-sizing:border-box;background:rgba(80,200,120,0.05);border:1px solid rgba(80,200,120,0.25);border-radius:10px;color:#E8E0D0;padding:9px 12px;font-size:13px;margin-bottom:6px;">
        </div>
        <div id="dmSuccessAmount" style="display:none;text-align:center;color:#50C878;font-size:18px;font-weight:800;"></div>
        <div id="dmResultMsg" style="display:none;font-size:12px;margin-bottom:6px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
          <button onclick="toggleInlinePanel('deposit')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:#A08060;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
          <button id="dmDepositBtn" onclick="submitDeposit()" style="background:linear-gradient(135deg,#50C878,#2E8B57);border:none;border-radius:10px;padding:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">Deposit</button>
        </div>
      </div>`;
  } else {
    panel.innerHTML = `
      <div style="margin-top:1.4vh;padding:1.8vh 0 0.6vh;border-top:1px solid rgba(232,131,74,0.18);">
        <div style="font-size:clamp(13px,1.9vh,16px);font-weight:800;color:#E8834A;margin-bottom:1.2vh;">⬆️ Withdraw</div>
        <span id="wmIcon" style="font-size:22px;text-align:center;display:block;margin-bottom:6px;">💸</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:1vh;">
          <div id="wmProvTele" onclick="wmSelectProvider('telebirr')" style="border:1.5px solid rgba(232,131,74,0.25);border-radius:10px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:18px;">📱</div><div style="font-size:11px;font-weight:700;color:#C4A882;">Telebirr</div>
          </div>
          <div id="wmProvCbe" onclick="wmSelectProvider('cbebirr')" style="border:1.5px solid rgba(232,131,74,0.25);border-radius:10px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:18px;">🏦</div><div style="font-size:11px;font-weight:700;color:#C4A882;">CBEbirr</div>
          </div>
        </div>
        <label class="wm-field-label">Phone Number</label>
        <input class="wm-input" id="wmPhone" type="tel" placeholder="09XX XXX XXX" style="width:100%;box-sizing:border-box;margin-bottom:8px;">
        <label class="wm-field-label">Full Name</label>
        <input class="wm-input" id="wmName" type="text" placeholder="Account holder name" style="width:100%;box-sizing:border-box;margin-bottom:8px;">
        <label class="wm-field-label">Amount (ETB)</label>
        <div class="wm-amount-wrap" style="position:relative;margin-bottom:6px;">
          <input id="wmAmount" type="number" placeholder="Min 200 ETB" oninput="wmClearChip()" style="width:100%;box-sizing:border-box;padding-right:48px;">
          <div class="wm-etb-tag">ETB</div>
        </div>
        <div class="wm-chips" style="margin-bottom:8px;">
          <div class="wm-chip" onclick="wmSetAmount(200,this)">200</div>
          <div class="wm-chip" onclick="wmSetAmount(300,this)">300</div>
          <div class="wm-chip" onclick="wmSetAmount(500,this)">500</div>
          <div class="wm-chip" onclick="wmSetAmount(1000,this)">1000</div>
        </div>
        <div id="wmHint" style="font-size:11px;color:#A08060;margin-bottom:8px;">Max: <span id="wmMaxAmt">${Math.floor((myWallet||0)*0.9).toLocaleString()} ETB</span> (90% of balance)</div>
        <div id="wmResultMsg" style="display:none;font-size:12px;margin-bottom:6px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
          <button onclick="toggleInlinePanel('withdraw')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:#A08060;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
          <button id="wmConfirmBtn" onclick="submitWithdraw()" style="background:linear-gradient(135deg,#E8834A,#C0522A);border:none;border-radius:10px;padding:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">Withdraw</button>
        </div>
      </div>`;
    window._wmSelected = null;
  }

  requestAnimationFrame(() => { panel.style.maxHeight = panel.scrollHeight + 200 + 'px'; });
}

function dashDeposit() { toggleInlinePanel('deposit'); }
function dashWithdraw() { toggleInlinePanel('withdraw'); }

function wmSelectProvider(p) {
  window._wmSelected = p;
  const tele = document.getElementById('wmProvTele');
  const cbe  = document.getElementById('wmProvCbe');
  if (tele) tele.style.borderColor = p === 'telebirr' ? '#E8834A' : 'rgba(232,131,74,0.25)';
  if (cbe)  cbe.style.borderColor  = p === 'cbebirr'  ? '#E8834A' : 'rgba(232,131,74,0.25)';
}

function wmSetAmount(amt, el) {
  const inp = document.getElementById('wmAmount');
  if (inp) inp.value = amt;
  document.querySelectorAll('.wm-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
}

function wmClearChip() {
  document.querySelectorAll('.wm-chip').forEach(c => c.classList.remove('active'));
}

/* ── Invite modal (bottom sheet) ── */
function dashInvite() {
  const _tg = getTelegramUser();
  if (!_tg || !_tg.telegram_id) {
    showToast('Please open via Telegram', '#FF3D71');
    return;
  }

  const btn = event?.target;
  if (btn) btn.disabled = true;

  fetch('/api/referral-info?telegram_id=' + encodeURIComponent(_tg.telegram_id))
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Error: ' + data.error, '#FF3D71');
        return;
      }
      const refLink = 'https://t.me/mygamezbot/bingo?startapp=' + (data.referralCode || _tg.telegram_id);
      const modal = document.createElement('div');
      modal.id = 'inviteModal';
      modal.className = 'bsheet-overlay';
      document.body.appendChild(modal);
      modal.addEventListener('click', closeInviteModal);
      modal.innerHTML = `
        <div class="bsheet-box" onclick="event.stopPropagation()">
          <div class="bsheet-handle-wrap"><div class="bsheet-handle"></div></div>
          <div class="bsheet-header">
            <div class="bsheet-title">💌 Invite</div>
            <div class="bsheet-close" onclick="closeInviteModal()">✕</div>
          </div>
          <div class="bsheet-body" id="inviteBox">
          <div class="inv-tabs">
            <div class="inv-tab active" id="invTabNet" onclick="invSwitchTab('network')">My Network</div>
            <div class="inv-tab" id="invTabLearn" onclick="invSwitchTab('learn')">Learn to Earn</div>
          </div>
          <div class="inv-body">
            <div id="invPanelNetwork">
              <div style="margin-bottom:14px;margin-top:8px;">
                <div class="inv-link-row">
                  <input class="inv-link-input" id="invLinkInput" value="${refLink}" readonly>
                  <button class="inv-copy-btn" id="invCopyBtn" onclick="invCopyLink()">Copy</button>
                  <button class="inv-tg-btn" onclick="invShareTelegram()">Send</button>
                </div>
              </div>
              <div class="inv-stats">
                <div class="inv-stat"><div class="inv-stat-val" id="invChildren">${data.children || 0}</div><div class="inv-stat-label">Children</div></div>
                <div class="inv-stat"><div class="inv-stat-val" id="invGrandchildren">${data.grandchildren || 0}</div><div class="inv-stat-label">Grandchildren</div></div>
                <div class="inv-stat"><div class="inv-stat-val" id="invEtbEarned">${data.etbEarned || 0} ETB</div><div class="inv-stat-label">ETB Earned</div></div>
                <div class="inv-stat"><div class="inv-stat-val" id="invXpEarned">${data.xpEarned || 0} XP</div><div class="inv-stat-label">XP Earned</div></div>
              </div>
              <div class="inv-tier-title" style="color:#D4A852;">🥇 Tier 1 — Children</div>
              <div id="invChildrenList" style="margin-bottom:14px;">
                ${data.childrenList && data.childrenList.length ?
                  data.childrenList.map(c =>
                    '<div class="inv-child"><div class="inv-child-name" style="color:#D4A852">' + c.name + '</div><div class="inv-child-xp">' + (c.xp || 0) + ' XP</div></div>'
                  ).join('') :
                  '<div style="color:#444;font-size:12px;padding:8px 0;">No referrals yet</div>'}
              </div>
              <div class="inv-tier-title" style="color:#4d8fff;">🥈 Tier 2 — Grandchildren</div>
              <div id="invGrandchildrenList">
                ${data.grandchildrenList && data.grandchildrenList.length ?
                  data.grandchildrenList.map(g =>
                    '<div class="inv-child"><div class="inv-child-name" style="color:#4d8fff">' + g.name + '</div><div class="inv-child-xp">via ' + (g.parent_name || 'friend') + '</div></div>'
                  ).join('') :
                  '<div style="color:#444;font-size:12px;padding:8px 0;">No grandchildren yet</div>'}
              </div>
            </div>
            <div id="invPanelLearn" style="display:none;">
              <div class="inv-cards-wrap" id="invCardsWrap">
                <div class="inv-cards-slider" id="invSlider">
                  <div class="inv-card">
                    <div class="inv-bingo-title">
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#D4A852,#E8834A)">B</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#50C878,#2E8B57);color:#fff">I</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#4169E1,#0000CD);color:#fff">N</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#DC143C,#8B0000);color:#fff">G</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#9966CC,#663399);color:#fff">O</div>
                    </div>
                    <div class="inv-card-body"><div class="inv-card-icon">🔑</div><div class="inv-card-heading">Invite</div><div class="inv-card-text">Share your referral link with friends. Each friend who joins earns you <strong style="color:#D4A852">+20 ETB</strong> and <strong style="color:#D4A852">+100 XP</strong> instantly.</div></div>
                  </div>
                  <div class="inv-card">
                    <div class="inv-bingo-title">
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#D4A852,#E8834A)">B</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#50C878,#2E8B57);color:#fff">I</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#4169E1,#0000CD);color:#fff">N</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#DC143C,#8B0000);color:#fff">G</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#9966CC,#663399);color:#fff">O</div>
                    </div>
                    <div class="inv-card-body"><div class="inv-card-icon">💰</div><div class="inv-card-heading">Reward</div><div class="inv-card-text">Earn <strong style="color:#50C878">3% lifetime</strong> of every win your direct referrals (Children) make. Passive income every round!</div></div>
                  </div>
                  <div class="inv-card">
                    <div class="inv-bingo-title">
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#D4A852,#E8834A)">B</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#50C878,#2E8B57);color:#fff">I</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#4169E1,#0000CD);color:#fff">N</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#DC143C,#8B0000);color:#fff">G</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#9966CC,#663399);color:#fff">O</div>
                    </div>
                    <div class="inv-card-body"><div class="inv-card-icon">👨‍👧</div><div class="inv-card-heading">Grandchildren</div><div class="inv-card-text">When your friends invite others, those become your Grandchildren. Earn <strong style="color:#4d8fff">1% lifetime</strong> of every grandchild win.</div></div>
                  </div>
                  <div class="inv-card">
                    <div class="inv-bingo-title">
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#D4A852,#E8834A)">B</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#50C878,#2E8B57);color:#fff">I</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#4169E1,#0000CD);color:#fff">N</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#DC143C,#8B0000);color:#fff">G</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#9966CC,#663399);color:#fff">O</div>
                    </div>
                    <div class="inv-card-body"><div class="inv-card-icon">👑</div><div class="inv-card-heading">Imagine If</div><div class="inv-card-text">Imagine 10 friends each with 10 friends. That's 100 Grandchildren — all earning you <strong style="color:#D4A852">1% per win</strong>. Build your empire!</div></div>
                  </div>
                  <div class="inv-card">
                    <div class="inv-bingo-title">
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#D4A852,#E8834A)">B</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#50C878,#2E8B57);color:#fff">I</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#4169E1,#0000CD);color:#fff">N</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#DC143C,#8B0000);color:#fff">G</div>
                      <div class="inv-bingo-letter" style="background:linear-gradient(135deg,#9966CC,#663399);color:#fff">O</div>
                    </div>
                    <div class="inv-card-body"><div class="inv-card-icon">📜</div><div class="inv-card-heading">How It Works</div><div class="inv-card-text">1. Share your link → Friend joins = <strong style="color:#D4A852">+20 ETB +100 XP</strong><br>2. Friend wins = <strong style="color:#50C878">+3% to you</strong><br>3. Friend's friend wins = <strong style="color:#4d8fff">+1% to you</strong></div></div>
                  </div>
                </div>
              </div>
              <div class="inv-arrows">
                <button class="inv-arrow" onclick="invSlide(-1)">◀</button>
                <div class="inv-dots" id="invDots">
                  <div class="inv-dot active" onclick="invGoTo(0)"></div>
                  <div class="inv-dot" onclick="invGoTo(1)"></div>
                  <div class="inv-dot" onclick="invGoTo(2)"></div>
                  <div class="inv-dot" onclick="invGoTo(3)"></div>
                  <div class="inv-dot" onclick="invGoTo(4)"></div>
                </div>
                <button class="inv-arrow" onclick="invSlide(1)">▶</button>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      `;
      setTimeout(() => { modal.classList.add('open'); attachBsheetDrag(modal); }, 10);

      window._invCardIdx = 0;
      const wrap = document.getElementById('invCardsWrap');
      if (wrap) {
        let startX = 0;
        wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; });
        wrap.addEventListener('touchend', e => {
          const dx = e.changedTouches[0].clientX - startX;
          if (Math.abs(dx) > 40) invSlide(dx < 0 ? 1 : -1);
        });
      }
    })
    .catch(err => {
      showToast('Failed to load referral info', '#FF3D71');
      console.error(err);
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => modal.remove(), 320);
}

function invSwitchTab(tab) {
  const isNet = tab === 'network';
  document.getElementById('invTabNet').classList.toggle('active', isNet);
  document.getElementById('invTabLearn').classList.toggle('active', !isNet);
  document.getElementById('invPanelNetwork').style.display = isNet ? '' : 'none';
  document.getElementById('invPanelLearn').style.display   = isNet ? 'none' : '';
}

function invCopyLink() {
  const inp = document.getElementById('invLinkInput');
  const btn = document.getElementById('invCopyBtn');
  if (!inp || !btn) return;
  const val = inp.value;
  const doFlash = () => { btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = 'Copy', 2000); };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(val).then(doFlash).catch(() => { inp.select(); doFlash(); });
  } else { inp.select(); try { document.execCommand('copy'); } catch(e) {} doFlash(); }
}

function invShareTelegram() {
  const inp = document.getElementById('invLinkInput');
  const url = inp ? inp.value : '';
  const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Join My Bingo and earn 20 ETB!');
  try { window.open(link, '_blank'); } catch(e) {}
}

function invSlide(dir) {
  window._invCardIdx = Math.max(0, Math.min(4, (window._invCardIdx || 0) + dir));
  invGoTo(window._invCardIdx);
}

function invGoTo(idx) {
  window._invCardIdx = idx;
  const slider = document.getElementById('invSlider');
  if (slider) slider.style.transform = 'translateX(-' + (idx * 100) + '%)';
  document.querySelectorAll('.inv-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

/* ═══════════════════════════════════════════════
   GIFT / ISLAND
   ═══════════════════════════════════════════════ */
function openGift5() {
  if (window.giftEndTime5 && Date.now() < window.giftEndTime5) {
    const diff = window.giftEndTime5 - Date.now();
    const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
    const pad = n => String(n).padStart(2,'0');
    showToast(`⏱ Next gift in ${pad(h)}:${pad(m)}:${pad(s)}`, '#E8834A');
    return;
  }
  document.getElementById('giftOverlay5').classList.add('open');
}

function openIsland5() {
  document.getElementById('islandOverlay5').classList.add('open');
}

/* ═══════════════════════════════════════════════
   TASKS
   ═══════════════════════════════════════════════ */
function loadTasks() {
    const tg = getTelegramUser();
    if (!tg || !tg.telegram_id) {
        const el = document.getElementById('taskList');
        if (el) el.innerHTML = '<div style="color:#A08060;padding:2vh;text-align:center;">Please open via Telegram</div>';
        return;
    }
    fetch('/api/tasks?telegram_id=' + encodeURIComponent(tg.telegram_id))
        .then(r => r.json())
        .then(tasks => renderTaskList(tasks))
        .catch(() => {
            const el = document.getElementById('taskList');
            if (el) el.innerHTML = '<div style="color:#A08060;padding:2vh;text-align:center;">Could not load tasks</div>';
        });
}

function renderTaskList(tasks) {
    const container = document.getElementById('taskList');
    if (!container) return;
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#A08060;padding:2vh;">No tasks available</div>';
        return;
    }
    container.innerHTML = '';
    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'd-task-item';
        const isLocked = task.type === 'telegram_channel' && (!task.meta || !task.meta.channel);
        if (isLocked) div.classList.add('d-task-locked');
        let btnHtml;
        if (task.claimed) {
            btnHtml = '<button class="d-claim-btn claimed" disabled>Claimed</button>';
        } else if (isLocked) {
            btnHtml = '<button class="d-claim-btn" disabled style="font-size:10px;">Soon</button>';
        } else {
            btnHtml = '<button class="d-claim-btn" onclick="claimTask(' + JSON.stringify(task.task_id) + ',' + task.reward_etb + ',' + JSON.stringify(task.type) + ',this)">Claim</button>';
        }
        const note = task.type !== 'auto' ? ' <span style="font-size:10px;color:#C4A882;">(24h pending)</span>' : '';
        div.innerHTML =
            '<div class="d-task-left">' +
                '<div class="d-task-icon">' + task.icon + '</div>' +
                '<div>' +
                    '<div class="d-task-name">' + task.name + '</div>' +
                    '<div class="d-task-reward">+' + task.reward_etb + ' ETB' + note + '</div>' +
                '</div>' +
            '</div>' + btnHtml;
        container.appendChild(div);
    });
}

function claimTask(taskId, reward, type, btn) {
    const tg = getTelegramUser();
    if (!tg || !tg.telegram_id) return showToast('Please open via Telegram', '#FF3D71');
    if (type === 'telegram_channel') {
        fetch('/api/tasks?telegram_id=' + encodeURIComponent(tg.telegram_id))
            .then(r => r.json())
            .then(tasks => {
                const task = tasks.find(t => t.task_id === taskId);
                if (task && task.meta && task.meta.channel) {
                    const ch = task.meta.channel.replace('@','');
                    if (window.Telegram && window.Telegram.WebApp) {
                        window.Telegram.WebApp.openTelegramLink('https://t.me/' + ch);
                    } else { window.open('https://t.me/' + ch, '_blank'); }
                }
                btn.disabled = true; btn.textContent = 'Verifying...';
                setTimeout(() => sendClaimRequest(taskId, reward, btn), 2500);
            });
        return;
    }
    btn.disabled = true; btn.textContent = '...';
    sendClaimRequest(taskId, reward, btn);
}

function sendClaimRequest(taskId, reward, btn) {
    const tg = getTelegramUser();
    fetch('/api/claim-task', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ telegram_id: tg.telegram_id, task_id: taskId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            btn.disabled = false; btn.textContent = 'Claim';
            return showToast('Error: ' + data.error, '#FF3D71');
        }
        btn.classList.add('claimed'); btn.textContent = 'Claimed'; btn.disabled = true;
        if (data.wallet !== undefined) {
            myWallet = data.wallet;
            document.getElementById('dashBalance').textContent = myWallet + ' ETB';
            document.getElementById('walletBalance').textContent = myWallet + ' ETB';
        }
        if (data.pendingBalance !== undefined) {
            window.myPendingBalance = data.pendingBalance;
            const el = document.getElementById('dashPendingAmount');
            if (el) el.textContent = window.myPendingBalance + ' ETB';
        }
        if (data.pending) {
            showToast('+' + reward + ' ETB pending (releases in 24h)', '#E8834A');
            loadPendingRewards();
        } else {
            showToast('+' + reward + ' ETB added to wallet!', '#50C878');
        }
    })
    .catch(() => {
        btn.disabled = false; btn.textContent = 'Claim';
        showToast('Network error, try again', '#FF3D71');
    });
}

window.claimTask = claimTask;

/* ═══════════════════════════════════════════════
   WELCOME / LEADERBOARD
   ═══════════════════════════════════════════════ */
function showWelcomeModal() {
    const hasSeenWelcome = localStorage.getItem('birr_welcome_shown');
    if (!hasSeenWelcome) {
        setTimeout(() => {
            const modal = document.getElementById('welcomeModal');
            if (modal) {
                modal.style.display = 'flex';
                localStorage.setItem('birr_welcome_shown', 'true');
                setTimeout(() => {
                    closeWelcomeModal();
                    openLeaderboardModal();
                }, 3000);
            } else {
                openLeaderboardModal();
            }
        }, 1000);
    } else {
        setTimeout(() => {
            openLeaderboardModal();
        }, 1000);
    }
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.style.display = 'none';
}

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
window.addEventListener('load', () => {
    initTheme();
    setupSwipeDetection();

    if (typeof io !== 'undefined') {
        connectToServer();
    } else {
        const overlay = document.getElementById('connectOverlay');
        if (overlay) overlay.classList.add('hidden');
        socket = { emit: () => {}, on: () => {} };
        myName   = 'Demo Player';
        myWallet = 10;
        myXP     = 320;
        myLevel  = 'Bronze';
        const tg = getTelegramUser();
        myName   = tg.name || myName;
        renderUI();
        updateProfileUI();
        openDashboard();

        function _genDemoCard() {
            const ranges = { b:[1,15], i:[16,30], n:[31,45], g:[46,60], o:[61,75] };
            const card = {};
            for (const [col, [lo, hi]] of Object.entries(ranges)) {
                const nums = [];
                while (nums.length < 5) {
                    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
                    if (!nums.includes(n)) nums.push(n);
                }
                card[col] = nums;
            }
            return card;
        }
        allCards = Array.from({length: 400}, _genDemoCard);

        gamePhase = 'countdown';
        countdownMax = 30;
        countdownCurrent = 30;
        document.getElementById('headerCountdown').textContent = 30;
        updateCountdownBar(30, 30);
        updatePhaseBadge();

        setInterval(() => {
            countdownCurrent--;
            if (countdownCurrent < 0) {
                countdownCurrent = 30;
                countdownMax = 30;
            }
            const cd = document.getElementById('headerCountdown');
            if (cd) cd.textContent = countdownCurrent;
            updateCountdownBar(countdownCurrent, countdownMax);
        }, 1000);
    }
});

/* Prevent overscroll */
document.body.addEventListener('touchmove', function(e) {
    if (!e.target.closest('.swipe-middle') &&
        !e.target.closest('.cards-section') &&
        !e.target.closest('.winner-slide') &&
        !e.target.closest('.unfinished-slide') &&
        !e.target.closest('.dash-scroll') &&
        !e.target.closest('.d-lb-list')) {
        e.preventDefault();
    }
}, { passive: false });
