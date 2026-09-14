/* ═══════════════════════════════════════════════
   EYE-ANIMATION.JS — Isolated eye tracking
   No side-effects: exports pure functions
   ═══════════════════════════════════════════════ */

const SAVAGE_LINES = [
    "You had ONE job. Pick a card.",
    "Congrats, you're the audience now.",
    "Don't worry, watching is free. Winning isn't.",
    "Your card is gone. Someone else took your money.",
    "Next time maybe join before the game starts?",
    "You: shows up late. Also you: surprised.",
    "This round is sponsored by your indecision.",
    "Even the bots picked a card. Think about that.",
    "The pot is growing. You're not in it.",
    "史 Spectator mode activated. Enjoy the show.",
    "Someone is about to win YOUR potential prize.",
    "It's okay. Watching builds character. Probably.",
    "Next round. Don't blow it again.",
    "The card you didn't pick just got marked. Twice.",
];

const MINI_EYE_X = { B: -28, I: -12, N: 0, G: 12, O: 28 };

const EYE_POSITIONS = {
    B: { x: -35, brow: 'left'  },
    I: { x: -16, brow: 'sleft' },
    N: { x:   0, brow: 'none'  },
    G: { x:  16, brow: 'sright'},
    O: { x:  35, brow: 'right' },
};

/* ── Internal state ── */
let savageTimer = null;
let savageIndex = Math.floor(Math.random() * SAVAGE_LINES.length);
let eyeAnimTimer = null;
let eyeBlinkTimer = null;
let eyeCurrentCol = 'N';
let eyeLastCol = null;

/* ── Mini eyes (swipe bar) ── */
export function miniEyeLookAt(col) {
    const x = MINI_EYE_X[col] ?? 0;
    const iL = document.getElementById('miniIrisL');
    const iR = document.getElementById('miniIrisR');
    if (!iL || !iR) return;
    iL.style.transform = `translate(calc(-50% + ${x}%), -50%)`;
    iR.style.transform = `translate(calc(-50% + ${x}%), -50%)`;
}

export function miniEyeBlink() {
    const eL = document.getElementById('miniEyeL');
    const eR = document.getElementById('miniEyeR');
    if (!eL || !eR) return;
    eL.classList.add('mini-blink');
    eR.classList.add('mini-blink');
    setTimeout(() => {
        eL.classList.remove('mini-blink');
        eR.classList.remove('mini-blink');
    }, 420);
}

/* ── Big eyes (watch mode) ── */
export function eyeLookAt(col) {
    eyeCurrentCol = col;
    const pos = EYE_POSITIONS[col] || EYE_POSITIONS['N'];

    const irisL = document.getElementById('irisLeft');
    const irisR = document.getElementById('irisRight');
    const browL = document.getElementById('browLeft');
    const browR = document.getElementById('browRight');

    if (!irisL || !irisR) return;

    irisL.style.transform = `translate(calc(-50% + ${pos.x}%), -50%)`;
    irisR.style.transform = `translate(calc(-50% + ${pos.x}%), -50%)`;

    const browMap = {
        left:   'rotate(5deg) translateX(-5px)',
        sleft:  'rotate(2deg) translateX(-2px)',
        none:   'rotate(0deg) translateX(0px)',
        sright: 'rotate(-2deg) translateX(2px)',
        right:  'rotate(-5deg) translateX(5px)',
    };
    const bt = browMap[pos.brow] || browMap['none'];
    if (browL) browL.style.transform = bt;
    if (browR) browR.style.transform = bt;

    ['B','I','N','G','O'].forEach(c => {
        const el = document.getElementById('wcol-' + c);
        if (el) el.classList.toggle('active', c === col);
    });
}

export function triggerBlink() {
    const eyeL = document.getElementById('eyeLeft');
    const eyeR = document.getElementById('eyeRight');
    if (!eyeL || !eyeR) return;

    eyeL.classList.add('blink-anim');
    eyeR.classList.add('blink-anim');

    eyeBlinkTimer = setTimeout(() => {
        eyeL.classList.remove('blink-anim');
        eyeR.classList.remove('blink-anim');
    }, 520);
}

/* ── Savage text rotation ── */
export function startSavageText() {
    stopSavageText();
    const el = document.getElementById('watchSavageText');
    if (!el) return;
    el.textContent = SAVAGE_LINES[savageIndex];
    el.classList.remove('fade');

    savageTimer = setInterval(() => {
        el.classList.add('fade');
        setTimeout(() => {
            savageIndex = (savageIndex + 1) % SAVAGE_LINES.length;
            el.textContent = SAVAGE_LINES[savageIndex];
            el.classList.remove('fade');
        }, 650);
    }, 4000);
}

export function stopSavageText() {
    if (savageTimer) { clearInterval(savageTimer); savageTimer = null; }
}

/* ── Full lifecycle ── */
export function startEyeAnimation() {
    stopEyeAnimation();
    eyeLookAt('N');
    triggerBlink();
    startSavageText();

    eyeAnimTimer = setInterval(() => {
        const cols = ['B','I','N','G','O'];
        const idx  = cols.indexOf(eyeCurrentCol);
        const next = cols[(idx + 1) % cols.length];
        eyeLookAt(next);
        triggerBlink();
    }, 4000);
}

export function stopEyeAnimation() {
    if (eyeAnimTimer)  { clearInterval(eyeAnimTimer);  eyeAnimTimer  = null; }
    if (eyeBlinkTimer) { clearTimeout(eyeBlinkTimer);  eyeBlinkTimer = null; }
    stopSavageText();
}

/* ── React to a call ── */
export function eyeReactToCall(letter) {
    miniEyeLookAt(letter);
    miniEyeBlink();

    const watchEyes = document.getElementById('watchModeEyes');
    if (!watchEyes || !watchEyes.classList.contains('active')) return;
    if (letter === eyeLastCol) return;
    eyeLastCol = letter;
    eyeLookAt(letter);
    setTimeout(triggerBlink, 200);
}
