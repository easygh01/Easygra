const STORAGE_KEY = 'grajownia-state-v1';
const STARTING_POINTS = 1000;
const REWARD_INTERVAL = 60_000;
const CHEST_INTERVAL = 60_000;
const CHEST_REWARD = 10_000;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isFinite(saved.points) && Number.isFinite(saved.lastRewardAt)) {
      return {
        points: Math.max(0, Math.floor(saved.points)),
        lastRewardAt: saved.lastRewardAt,
        chestOnlineMs: Number.isFinite(saved.chestOnlineMs) ? Math.max(0, Math.min(CHEST_INTERVAL, saved.chestOnlineMs)) : 0,
        playerName: typeof saved.playerName === 'string' ? saved.playerName.slice(0, 24) : '',
      };
    }
  } catch {
    // Start with a fresh balance if saved browser data is invalid.
  }
  return { points: STARTING_POINTS, lastRewardAt: Date.now(), chestOnlineMs: 0, playerName: '' };
}

let state = loadState();
let selectedColor = 'red';
let blackjack = { active: false, player: [], dealer: [] };
let toastTimeout;
let winBannerTimeout;
let chestLastTickAt = Date.now();
let chestUnsavedMs = 0;
let selectedPaylineCount = 3;
let freeSpinLineCount = 3;

const DEMO_PLAYERS = [
  { name: 'RoyalMila', points: 128_400 },
  { name: 'NeonFox', points: 84_250 },
  { name: 'ZlotaKarta', points: 52_800 },
  { name: 'LuckyBartek', points: 31_600 },
];

const PAYLINE_DEFINITIONS = [
  { index: 0, id: 'top', name: '1', positions: [0, 0, 0] },
  { index: 1, id: 'middle', name: '2', positions: [1, 1, 1] },
  { index: 2, id: 'bottom', name: '3', positions: [2, 2, 2] },
  { index: 3, id: 'diagonal-down', name: '4', positions: [0, 1, 2] },
  { index: 4, id: 'diagonal-up', name: '5', positions: [2, 1, 0] },
];

const balanceElement = document.querySelector('#balance');
const progressElement = document.querySelector('#income-progress');
const progressTrack = document.querySelector('.progress-track');
const countdownElement = document.querySelector('#countdown');
const toastElement = document.querySelector('#toast');
const winBanner = document.querySelector('#win-banner');

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('grajownia:state', {
    detail: { playerName: state.playerName || 'Gość', points: state.points },
  }));
}

function formatPoints(points) {
  return new Intl.NumberFormat('pl-PL').format(points);
}

function renderBalance() {
  balanceElement.textContent = formatPoints(state.points);
  document.querySelector('#table-balance').textContent = formatPoints(state.points);
  renderLeaderboard();
}

function renderLeaderboard() {
  if (window.grajowniaCommunity?.connected) return;
  const players = [...DEMO_PLAYERS, { name: 'Ty', points: state.points, isPlayer: true }]
    .sort((first, second) => second.points - first.points)
    .slice(0, 5);
  const list = document.querySelector('#leaderboard-list');
  list.replaceChildren(...players.map((player, index) => {
    const row = document.createElement('li');
    row.className = `leaderboard-entry${player.isPlayer ? ' is-player' : ''}`;
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = player.isPlayer ? (state.playerName || 'Gość') : player.name;
    const points = document.createElement('span');
    points.className = 'leaderboard-points';
    points.textContent = `${formatPoints(player.points)} pkt`;
    row.append(rank, name, points);
    return row;
  }));
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function syncChestState() {
  const chestButton = document.querySelector('#claim-chest');
  const chestCountdown = document.querySelector('#chest-countdown');
  const now = Date.now();
  const elapsed = Math.max(0, now - chestLastTickAt);
  chestLastTickAt = now;
  if (document.visibilityState === 'visible' && state.chestOnlineMs < CHEST_INTERVAL) {
    const creditedMs = Math.min(elapsed, CHEST_INTERVAL - state.chestOnlineMs);
    state.chestOnlineMs += creditedMs;
    chestUnsavedMs += creditedMs;
    if (chestUnsavedMs >= 5000) {
      saveState();
      chestUnsavedMs = 0;
    }
  }
  const remaining = CHEST_INTERVAL - state.chestOnlineMs;

  if (remaining <= 0) {
    chestCountdown.textContent = 'GOTOWE';
    chestButton.disabled = false;
    chestButton.textContent = 'Odbierz';
    return;
  }

  chestCountdown.textContent = formatCountdown(remaining);
  chestButton.disabled = true;
  chestButton.textContent = 'Odbierz';
}

function claimChestReward() {
  const remaining = CHEST_INTERVAL - state.chestOnlineMs;
  if (remaining > 0) {
    showToast('Skrzynka będzie gotowa za kilka minut.');
    return;
  }

  state.points += CHEST_REWARD;
  state.chestOnlineMs = 0;
  chestUnsavedMs = 0;
  chestLastTickAt = Date.now();
  saveState();
  renderBalance();
  syncChestState();
  showWinBanner('SKRZYNKA BONUSOWA', `+ ${formatPoints(CHEST_REWARD)}`, 'pkt');
  showToast('Skrzynka otwarta! +10 000 pkt');
  announceBigWin(CHEST_REWARD, 'Skrzynka bonusowa');
  announceBigWin(CHEST_REWARD, 'Skrzynka bonusowa');
}

function syncIncome() {
  const now = Date.now();
  const earnedIntervals = Math.floor((now - state.lastRewardAt) / REWARD_INTERVAL);
  if (earnedIntervals > 0) {
    state.points += earnedIntervals * 10;
    state.lastRewardAt += earnedIntervals * REWARD_INTERVAL;
    saveState();
    renderBalance();
  }

  const elapsed = now - state.lastRewardAt;
  const secondsLeft = Math.ceil((REWARD_INTERVAL - elapsed) / 1000);
  const progress = Math.min(100, (elapsed / REWARD_INTERVAL) * 100);
  progressElement.style.width = `${progress}%`;
  progressTrack.setAttribute('aria-valuenow', String(Math.floor((elapsed / REWARD_INTERVAL) * 60)));
  countdownElement.textContent = `${secondsLeft} s`;
  syncChestState();
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastElement.classList.remove('is-visible'), 2400);
}

function showWinBanner(title, value, unit) {
  document.querySelector('#win-title').textContent = title;
  document.querySelector('#win-value').textContent = value;
  document.querySelector('#win-unit').textContent = unit;
  winBanner.hidden = false;
  winBanner.classList.remove('is-visible');
  void winBanner.offsetWidth;
  winBanner.classList.add('is-visible');
  clearTimeout(winBannerTimeout);
  winBannerTimeout = setTimeout(() => {
    winBanner.classList.remove('is-visible');
    setTimeout(() => { winBanner.hidden = true; }, 300);
  }, 3200);
}

document.querySelector('#win-dismiss').addEventListener('click', () => {
  clearTimeout(winBannerTimeout);
  winBanner.classList.remove('is-visible');
  setTimeout(() => { winBanner.hidden = true; }, 300);
});

const profileDialog = document.querySelector('#profile-dialog');
const profileInput = document.querySelector('#profile-name-input');
const profileToggle = document.querySelector('#profile-toggle');

function renderProfile() {
  const playerName = state.playerName || 'Gość';
  document.querySelector('#profile-initial').textContent = playerName.slice(0, 1).toLocaleUpperCase('pl-PL');
  profileInput.value = state.playerName;
  renderLeaderboard();
}

profileToggle.addEventListener('click', () => {
  profileInput.value = state.playerName;
  profileDialog.showModal();
  profileToggle.setAttribute('aria-expanded', 'true');
  profileInput.focus();
});

document.querySelector('#profile-close').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('close', () => profileToggle.setAttribute('aria-expanded', 'false'));
document.querySelector('#profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const playerName = profileInput.value.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!playerName) {
    profileInput.focus();
    return;
  }
  state.playerName = playerName;
  saveState();
  renderProfile();
  profileDialog.close();
  showToast(`Grasz jako ${playerName}`);
});

document.querySelectorAll('.stake-step').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.dataset.target}`);
    if (input.disabled) return;
    const min = Number(input.min) || 10;
    const max = Number(input.max) || 500;
    const step = Number(input.step) || 10;
    const current = Number(input.value) || min;
    input.value = String(Math.min(max, Math.max(min, current + Number(button.dataset.delta))));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

document.querySelector('#claim-chest').addEventListener('click', claimChestReward);
document.addEventListener('visibilitychange', () => { chestLastTickAt = Date.now(); });

function setMessage(selector, message, result = '') {
  const element = document.querySelector(selector);
  element.textContent = message;
  element.classList.toggle('is-win', result === 'win');
  element.classList.toggle('is-loss', result === 'loss');
  if (result === 'win') {
    const panel = element.closest('.game-panel');
    panel.classList.remove('has-win');
    void panel.offsetWidth;
    panel.classList.add('has-win');
  }
}

function readStake(selector) {
  const input = document.querySelector(selector);
  const stake = Math.floor(Number(input.value));
  if (!Number.isFinite(stake) || stake < 10 || stake > 500 || stake % 10 !== 0) {
    showToast('Stawka musi wynosić od 10 do 500 pkt, co 10 pkt.');
    input.focus();
    return null;
  }
  if (stake > state.points) {
    showToast('Masz za mało punktów na tę stawkę.');
    input.focus();
    return null;
  }
  return stake;
}

function placeBet(stake) {
  state.points -= stake;
  saveState();
  renderBalance();
}

function announceBigWin(points, title) {
  if (points <= 1000) return;
  window.dispatchEvent(new CustomEvent('grajownia:big-win', {
    detail: { playerName: state.playerName || 'Gość', points, title },
  }));
}

function awardPoints(points, title = 'WYGRANA', netProfit = points) {
  state.points += points;
  saveState();
  renderBalance();
  const bannerTitle = netProfit > 0 ? title : netProfit === 0 ? 'ZWROT STAWKI' : 'CZĘŚCIOWA WYPŁATA';
  const sign = netProfit > 0 ? '+ ' : netProfit < 0 ? '− ' : '';
  const resultLabel = netProfit > 0 ? 'ZYSK NETTO · PKT' : 'BILANS NETTO · PKT';
  showWinBanner(bannerTitle, `${sign}${formatPoints(Math.abs(netProfit))}`, resultLabel);
  announceBigWin(netProfit, title);
}

document.querySelectorAll('[data-game]').forEach((button) => {
  button.addEventListener('click', () => {
    const game = button.dataset.game;
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== game;
    });
    document.querySelectorAll('.game-tab').forEach((tab) => {
      const active = tab.dataset.game === game;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.nav-game').forEach((navButton) => {
      const active = navButton.dataset.game === game;
      navButton.classList.toggle('is-active', active);
      if (active) navButton.setAttribute('aria-current', 'page');
      else navButton.removeAttribute('aria-current');
    });
  });
});

function createSlotGame(title, machine, prompt, reelStrip, payouts, subtitle, rows = 1) {
  return {
    title,
    machine,
    prompt,
    subtitle,
    reels: [reelStrip, reelStrip, reelStrip],
    rows,
    payouts,
    scatterSymbol: 'scatter',
    freeSpinsAward: 5,
  };
}

const SLOT_SYMBOLS = {
  seven: { asset: 'seven', label: 'Siódemka', className: 'seven-symbol' },
  lemon: { asset: 'lemon', label: 'Cytryna' },
  orange: { asset: 'orange', label: 'Pomarańcza' },
  cherry: { asset: 'cherry', label: 'Wiśnie' },
  bell: { asset: 'bell', label: 'Dzwonek', className: 'bell-symbol' },
  bar: { asset: 'bar', label: 'BAR', className: 'bar-symbol' },
  scatter: { asset: 'scatter', label: 'Scatter', className: 'scatter-symbol' },
  grapes: { asset: 'grapes', label: 'Winogrona' },
  diamond: { asset: 'diamond', label: 'Diament', className: 'diamond-symbol' },
  ruby: { asset: 'ruby-diamond', label: 'Rubin', className: 'diamond-symbol' },
  scarab: { asset: 'scarab', label: 'Skarabeusz' },
  crown: { asset: 'crown', label: 'Korona' },
  amphora: { asset: 'amphora', label: 'Amfora' },
  ring: { asset: 'ring', label: 'Pierścień' },
  moon: { asset: 'moon', label: 'Księżyc' },
  lightning: { asset: 'lightning', label: 'Błyskawica' },
  shell: { asset: 'shell', label: 'Muszla' },
  fish: { asset: 'fish', label: 'Ryba' },
  coral: { asset: 'coral', label: 'Koralowiec' },
  anchor: { asset: 'anchor', label: 'Kotwica' },
  magnet: { asset: 'magnet', label: 'Magnes' },
  cowboy: { asset: 'cowboy', label: 'Kapelusz kowbojski' },
  cactus: { asset: 'cactus', label: 'Kaktus' },
  star: { asset: 'star', label: 'Gwiazda' },
  sunstar: { asset: 'sunstar', label: 'Rozbłysk gwiezdny' },
  planet: { asset: 'planet', label: 'Planeta' },
  comet: { asset: 'comet', label: 'Kometa' },
};

const slotGames = {
  sevens: createSlotGame('Lucky 777', 'LUCKY 777', 'TRAF 777 I ODBIERZ JACKPOT', ['seven', 'lemon', 'lemon', 'lemon', 'lemon', 'orange', 'orange', 'cherry', 'cherry', 'bell', 'bell', 'bar', 'scatter'], { seven: 120, lemon: 14, orange: 20, cherry: 30, bell: 40, bar: 100 }, 'Klasyczna linia 777 zgarnia 120× stawki.'),
  fruits: createSlotGame('Owocowy klub', 'FRUIT CLUB', 'OWOCOWA LINIA CZEKA', ['cherry', 'cherry', 'cherry', 'cherry', 'lemon', 'lemon', 'orange', 'orange', 'grapes', 'grapes', 'bar', 'bell', 'scatter'], { cherry: 14, lemon: 22, orange: 26, grapes: 36, bar: 90, bell: 60 }, 'Klasyczne owoce i dzwonki. BAR wypłaca 90× stawki.'),
  diamonds: createSlotGame('Diamentowy', 'DIAMOND VAULT', 'OTWÓRZ DIAMENTOWY SKARBIEC', ['diamond', 'diamond', 'ruby', 'ruby', 'ruby', 'ruby', 'seven', 'seven', 'bar', 'bar', 'bell', 'cherry', 'scatter'], { diamond: 28, ruby: 20, seven: 50, bar: 60, bell: 90, cherry: 100 }, 'Diamenty, siódemki i klasyczne symbole BAR.'),
  pharaoh: createSlotGame('Skarb faraona', 'PHARAOH GOLD', 'ODKRYJ ZŁOTO FARAONÓW', ['scarab', 'scarab', 'scarab', 'scarab', 'crown', 'crown', 'amphora', 'amphora', 'ring', 'ring', 'bar', 'seven', 'scatter'], { scarab: 12, crown: 24, amphora: 32, ring: 40, bar: 75, seven: 120 }, 'Symbole skarbu i egipska linia 7 za 120× stawki.'),
  midnight: createSlotGame('Nocny neon', 'MIDNIGHT NEON', 'ZŁAP NEONOWĄ SERIĘ', ['moon', 'moon', 'moon', 'moon', 'lightning', 'lightning', 'diamond', 'diamond', 'bell', 'bell', 'bar', 'seven', 'scatter'], { moon: 14, lightning: 22, diamond: 30, bell: 44, bar: 90, seven: 150 }, 'Neonowa seria z najwyższą linią 7 za 150×.'),
  royal: createSlotGame('Królewski dzwon', 'ROYAL BELLS', 'ZAGRAJ O KRÓLEWSKĄ LINIĘ', ['bell', 'bell', 'bell', 'bell', 'cherry', 'cherry', 'crown', 'crown', 'seven', 'seven', 'bar', 'diamond', 'scatter'], { bell: 14, cherry: 20, crown: 32, seven: 45, bar: 100, diamond: 120 }, 'Królewskie symbole, dzwonki i diament za 120×.'),
  ocean: createSlotGame('Skarby oceanu', 'OCEAN TREASURE', 'ODKRYJ SKARB POD FALAMI', ['shell', 'shell', 'shell', 'shell', 'shell', 'fish', 'fish', 'coral', 'coral', 'anchor', 'bell', 'bar', 'scatter'], { shell: 4, fish: 6, coral: 8, anchor: 12, bell: 18, bar: 32 }, 'Trzy linie. Niższe mnożniki i częstsze trafienia.', 3),
  wildwest: createSlotGame('Dziki Zachód', 'WILD WEST', 'ZŁAP ZŁOTĄ PODKOWĘ', ['magnet', 'magnet', 'magnet', 'magnet', 'magnet', 'cowboy', 'cowboy', 'cactus', 'cactus', 'star', 'bell', 'bar', 'scatter'], { magnet: 4, cowboy: 6, cactus: 8, star: 12, bell: 18, bar: 32 }, 'Trzy linie. Złap cztery częste symbole na linii.', 3),
  cosmos: createSlotGame('Kosmiczny jackpot', 'COSMIC REELS', 'TRAF GWIEZDNĄ KONIUNKCJĘ', ['sunstar', 'sunstar', 'sunstar', 'sunstar', 'sunstar', 'planet', 'planet', 'comet', 'comet', 'moon', 'diamond', 'bar', 'scatter'], { sunstar: 4, planet: 6, comet: 8, moon: 12, diamond: 18, bar: 32 }, 'Trzy linie i wyższa szansa na wygraną linię.', 3),
};
let selectedSlot = 'sevens';
let slotBusy = false;
let freeSpins = 0;
let freeSpinStake = 0;

function getActivePaylines(game, lineCount = selectedPaylineCount) {
  if (game.rows === 1) {
    return [{ ...PAYLINE_DEFINITIONS[1], positions: [0, 0, 0] }];
  }
  if (lineCount === 1) return [PAYLINE_DEFINITIONS[1]];
  return PAYLINE_DEFINITIONS.slice(0, lineCount === 3 ? 3 : 5);
}

function renderPaylineSelection(game) {
  const selector = document.querySelector('#payline-selector');
  selector.hidden = game.rows === 1;
  const activePaylineIds = new Set(getActivePaylines(game).map((line) => line.id));
  document.querySelectorAll('.payline').forEach((line) => {
    line.hidden = !activePaylineIds.has(line.dataset.paylineId);
    line.classList.remove('is-winning');
  });
  document.querySelectorAll('.line-option').forEach((button) => {
    const selected = Number(button.dataset.lines) === selectedPaylineCount;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = game.rows === 1 || slotBusy || freeSpins > 0;
  });
}

function createSlotIcon(symbol) {
  const metadata = SLOT_SYMBOLS[symbol];
  if (!metadata) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', metadata.label);
  svg.classList.add('slot-symbol-art');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `slot-symbols.svg#${metadata.asset}`);
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `slot-symbols.svg#${metadata.asset}`);
  svg.append(use);
  return svg;
}

function setReelSymbolStyle(element, symbol) {
  element.classList.remove('seven-symbol', 'bar-symbol', 'bell-symbol', 'diamond-symbol', 'scatter-symbol');
  const metadata = SLOT_SYMBOLS[symbol];
  if (!metadata) {
    element.textContent = symbol;
    return;
  }
  if (metadata.className) element.classList.add(metadata.className);
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', metadata.label);
  element.replaceChildren(createSlotIcon(symbol));
}

function setReelSymbols(reel, symbols) {
  let cells = Array.from(reel.querySelectorAll('.reel-symbol'));
  if (cells.length !== symbols.length) {
    reel.replaceChildren(...symbols.map(() => {
      const element = document.createElement('span');
      element.className = 'reel-symbol';
      return element;
    }));
    cells = Array.from(reel.querySelectorAll('.reel-symbol'));
  }
  cells.forEach((element, index) => {
    setReelSymbolStyle(element, symbols[index]);
  });
}

function renderSlotGame(game) {
  document.querySelector('#slot-title').textContent = game.title;
  document.querySelector('#slot-subtitle').textContent = game.subtitle;
  document.querySelector('#machine-name').textContent = game.machine;
  document.querySelector('#machine-prompt').textContent = game.prompt;
  const machine = document.querySelector('#slot-machine');
  machine.classList.remove('is-jackpot');
  machine.dataset.theme = selectedSlot;
  document.querySelectorAll('.slot-choice-art').forEach((element) => {
    element.replaceChildren(createSlotIcon(element.dataset.slotSymbol));
  });
  const reelsContainer = document.querySelector('.reels');
  reelsContainer.classList.toggle('is-single-row', game.rows === 1);
  renderPaylineSelection(game);
  document.querySelector('#slot-stake-label').textContent = game.rows === 1 ? 'STAWKA / SPIN' : 'STAWKA / LINIA';
  const payoutList = document.querySelector('#slot-payouts');
  payoutList.replaceChildren(...Object.entries(game.payouts).map(([symbol, multiplier]) => {
    const item = document.createElement('span');
    item.className = 'payout-item';
    const payoutSymbol = document.createElement('strong');
    payoutSymbol.className = 'payout-symbol';
    payoutSymbol.append(createSlotIcon(symbol));
    const payoutValue = document.createElement('small');
    payoutValue.textContent = `${multiplier}×`;
    item.append(payoutSymbol, payoutValue);
    return item;
  }));
  [1, 2, 3].forEach((number) => {
    const reel = document.querySelector(`#reel-${number}`);
    const strip = game.reels[number - 1];
    setReelSymbols(reel, Array.from({ length: game.rows }, () => strip[Math.floor(Math.random() * strip.length)]));
  });
  updateSlotTotal();
  setMessage('#slot-message', 'Wygrywają tylko trójki symboli. Pary nie wypłacają.');
}

function renderFreeSpins() {
  document.querySelector('#free-spin-counter').textContent = `FREE SPINS · ${freeSpins}`;
  document.querySelector('#spin-label').textContent = freeSpins > 0 ? 'Darmowy spin' : 'Zakręć';
  document.querySelector('#slot-stake').disabled = slotBusy || freeSpins > 0;
  document.querySelector('#spin-button').disabled = slotBusy;
  renderPaylineSelection(slotGames[selectedSlot]);
  document.querySelectorAll('.slot-choice').forEach((choice) => {
    choice.disabled = slotBusy || (freeSpins > 0 && choice.dataset.slot !== selectedSlot);
  });
}

document.querySelectorAll('.slot-choice').forEach((button) => {
  button.addEventListener('click', () => {
    if (freeSpins > 0 || slotBusy) return;
    selectedSlot = button.dataset.slot;
    const game = slotGames[selectedSlot];
    document.querySelectorAll('.slot-choice').forEach((choice) => {
      const active = choice === button;
      choice.classList.toggle('is-selected', active);
      choice.setAttribute('aria-pressed', String(active));
    });
    renderSlotGame(game);
  });
});

document.querySelectorAll('.line-option').forEach((button) => {
  button.addEventListener('click', () => {
    if (slotBusy || freeSpins > 0) return;
    selectedPaylineCount = Number(button.dataset.lines);
    renderPaylineSelection(slotGames[selectedSlot]);
    updateSlotTotal();
  });
});

document.querySelector('#spin-button').addEventListener('click', () => {
  if (slotBusy) return;
  const isFreeSpin = freeSpins > 0;
  const stake = isFreeSpin ? freeSpinStake : readStake('#slot-stake');
  if (stake === null) return;
  const game = slotGames[selectedSlot];
  const lineCount = isFreeSpin ? freeSpinLineCount : game.rows === 1 ? 1 : selectedPaylineCount;
  const spinCost = stake * lineCount;
  if (!isFreeSpin && spinCost > state.points) {
    showToast(`Za mało punktów. Ten spin kosztuje ${formatPoints(spinCost)} pkt.`);
    return;
  }
  if (isFreeSpin) freeSpins -= 1;
  else placeBet(spinCost);
  slotBusy = true;
  renderFreeSpins();
  const machine = document.querySelector('#slot-machine');
  machine.classList.remove('is-jackpot');
  const reels = [1, 2, 3].map((number) => document.querySelector(`#reel-${number}`));
  const result = reels.map((reel, index) => {
    const strip = game.reels[index];
    return Array.from({ length: game.rows }, () => strip[Math.floor(Math.random() * strip.length)]);
  });
  const spinIntervals = reels.map((reel, index) => {
    reel.classList.remove('is-stopped', 'is-winning');
    reel.querySelectorAll('.reel-symbol').forEach((symbol) => symbol.classList.remove('is-winning'));
    reel.classList.add('is-spinning');
    return setInterval(() => {
      const strip = game.reels[index];
      setReelSymbols(reel, Array.from({ length: game.rows }, () => strip[Math.floor(Math.random() * strip.length)]));
    }, 65 + index * 18);
  });
  const stopDelays = [1050, 1450, 1850];
  reels.forEach((reel, index) => {
    setTimeout(() => {
      clearInterval(spinIntervals[index]);
      setReelSymbols(reel, result[index]);
      reel.classList.remove('is-spinning');
      reel.classList.add('is-stopped');
    }, stopDelays[index]);
  });
  setMessage('#slot-message', isFreeSpin ? 'Darmowe bębny w ruchu…' : 'Bębny w ruchu…');
  setTimeout(() => {
    const scatterCount = result.flat().filter((symbol) => symbol === game.scatterSymbol).length;
    const winningLines = getActivePaylines(game, lineCount).flatMap((line) => {
      const symbols = line.positions.map((row, reelIndex) => result[reelIndex][row]);
      const symbol = symbols[0];
      const matchingLine = symbol !== game.scatterSymbol && symbols.every((lineSymbol) => lineSymbol === symbol);
      return matchingLine && game.payouts[symbol] ? [{ line, symbol, multiplier: game.payouts[symbol] }] : [];
    });
    const totalPayout = stake * winningLines.reduce((total, line) => total + line.multiplier, 0);

    if (scatterCount >= 3) {
      if (!isFreeSpin) {
        freeSpinStake = stake;
        freeSpinLineCount = lineCount;
      }
      freeSpins += game.freeSpinsAward;
      if (totalPayout === 0) showWinBanner('BONUS SCATTER', `+ ${game.freeSpinsAward}`, 'DARMOWYCH SPINÓW');
    }
    if (totalPayout > 0) {
      winningLines.forEach(({ line }) => {
        line.positions.forEach((row, reelIndex) => {
          reels[reelIndex].querySelectorAll('.reel-symbol')[row].classList.add('is-winning');
        });
      });
      const lineLabels = winningLines.map(({ line }) => line.name).join(', ');
      const netProfit = totalPayout - (isFreeSpin ? 0 : spinCost);
      awardPoints(totalPayout, `LINIE ${lineLabels}`, netProfit);
      const bonusMessage = scatterCount >= 3 ? ` · +${game.freeSpinsAward} DARMOWYCH SPINÓW` : '';
      const settlement = netProfit > 0
        ? `ZYSK NETTO +${formatPoints(netProfit)} PKT · WYPŁATA BRUTTO ${formatPoints(totalPayout)} PKT`
        : netProfit === 0
          ? `ZWROT STAWKI · WYPŁATA BRUTTO ${formatPoints(totalPayout)} PKT`
          : `WYPŁATA BRUTTO ${formatPoints(totalPayout)} PKT · BILANS SPINU −${formatPoints(Math.abs(netProfit))} PKT`;
      setMessage('#slot-message', `LINIE ${lineLabels} · ${settlement}${bonusMessage}`, netProfit > 0 ? 'win' : netProfit < 0 ? 'loss' : '');
      winningLines.forEach(({ line }) => {
        document.querySelector(`.payline[data-payline-id="${line.id}"]`).classList.add('is-winning');
      });
      if (winningLines.some(({ symbol }) => symbol === 'seven' || symbol === 'diamond')) machine.classList.add('is-jackpot');
    } else if (scatterCount >= 3) {
      setMessage('#slot-message', `BONUS! ${freeSpins} darmowych spinów.`, 'win');
    } else {
      setMessage('#slot-message', isFreeSpin ? 'Darmowy spin bez wygranej. Bonus trwa dalej.' : `Brak trafienia na ${lineCount} ${lineCount === 1 ? 'linii' : 'liniach'}. Następny spin?`);
    }
    slotBusy = false;
    renderFreeSpins();
  }, 1950);
});

function updateSlotTotal() {
  const stake = Math.floor(Number(document.querySelector('#slot-stake').value));
  const game = slotGames[selectedSlot];
  const lineCount = game.rows === 1 ? 1 : (freeSpins > 0 ? freeSpinLineCount : selectedPaylineCount);
  const lineUnit = lineCount === 1 ? 'LINIA' : 'LINII';
  document.querySelector('#slot-total-label').textContent = game.rows === 1 ? 'KOSZT SPINU' : `SUMA ${lineCount} ${lineUnit}`;
  document.querySelector('#slot-total-bet').textContent = Number.isFinite(stake) && stake > 0 ? `${formatPoints(stake * lineCount)} pkt` : '—';
}

document.querySelector('#slot-stake').addEventListener('input', updateSlotTotal);

renderSlotGame(slotGames[selectedSlot]);
renderFreeSpins();
updateSlotTotal();

document.querySelectorAll('.color-choice').forEach((button) => {
  button.addEventListener('click', () => {
    selectedColor = button.dataset.color;
    document.querySelectorAll('.color-choice').forEach((choice) => choice.classList.toggle('is-selected', choice === button));
  });
});

const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
document.querySelector('#roulette-button').addEventListener('click', (event) => {
  const stake = readStake('#roulette-stake');
  if (stake === null) return;
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  placeBet(stake);
  const wheel = document.querySelector('.roulette-wheel');
  wheel.classList.remove('is-spinning');
  void wheel.offsetWidth;
  wheel.classList.add('is-spinning');
  setMessage('#roulette-message', 'Koło się kręci…');
  setTimeout(() => {
    wheel.classList.remove('is-spinning');
    const number = Math.floor(Math.random() * 37);
    const color = number === 0 ? 'green' : redNumbers.has(number) ? 'red' : 'black';
    document.querySelector('#roulette-result').textContent = String(number);
    const colorNames = { red: 'CZERWONY', black: 'CZARNY', green: 'ZIELONY' };
      const outcome = document.querySelector('.roulette-outcome');
      outcome.classList.remove('is-red', 'is-black', 'is-green');
      outcome.classList.add(`is-${color}`);
    document.querySelector('#roulette-color').textContent = colorNames[color];
    if (color === selectedColor) {
      const multiplier = color === 'green' ? 14 : 2;
      const grossPayout = stake * multiplier;
      const netProfit = grossPayout - stake;
      awardPoints(grossPayout, 'RULETKA', netProfit);
      setMessage('#roulette-message', `Trafiony ${colorNames[color].toLowerCase()} · wypłata ${formatPoints(grossPayout)} pkt · zysk netto +${formatPoints(netProfit)} pkt.`, 'win');
    } else {
      setMessage('#roulette-message', `Wypadło ${number} — ${colorNames[color].toLowerCase()}. Spróbuj ponownie.`, 'loss');
    }
    button.disabled = false;
  }, 2500);
});

function drawCard() {
  const rank = Math.floor(Math.random() * 13) + 1;
  const suit = ['♠', '♥', '♦', '♣'][Math.floor(Math.random() * 4)];
  const label = rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
  const value = rank === 1 ? 11 : Math.min(rank, 10);
  return { label, suit, value, red: suit === '♥' || suit === '♦' };
}

function handValue(cards) {
  let total = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.value === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function renderHand(selector, cards, hideSecond = false) {
  const container = document.querySelector(selector);
  container.replaceChildren(...cards.map((card, index) => {
    const element = document.createElement('span');
    element.className = `playing-card${card.red ? ' red-card' : ''}${hideSecond && index === 1 ? ' card-back' : ''}`;
    element.textContent = hideSecond && index === 1 ? '✳' : `${card.label}${card.suit}`;
    return element;
  }));
}

function renderBlackjack(hideDealerCard = blackjack.active) {
  renderHand('#player-cards', blackjack.player);
  renderHand('#dealer-cards', blackjack.dealer, hideDealerCard);
  document.querySelector('#player-total').textContent = blackjack.player.length ? `· ${handValue(blackjack.player)}` : '';
  document.querySelector('#dealer-total').textContent = !blackjack.dealer.length ? '' : hideDealerCard ? `· ${handValue([blackjack.dealer[0]])} + ?` : `· ${handValue(blackjack.dealer)}`;
  document.querySelector('#hit-button').disabled = !blackjack.active;
  document.querySelector('#stand-button').disabled = !blackjack.active;
  document.querySelector('#deal-button').disabled = blackjack.active;
}

function finishBlackjack(message, result, payout = 0, netProfit = payout) {
  blackjack.active = false;
  if (payout > 0) awardPoints(payout, result === 'win' ? 'BLACKJACK' : 'ZWROT STAWKI', netProfit);
  renderBlackjack(false);
  setMessage('#blackjack-message', message, result);
}

document.querySelector('#deal-button').addEventListener('click', () => {
  const stake = readStake('#blackjack-stake');
  if (stake === null || blackjack.active) return;
  placeBet(stake);
  blackjack = { active: true, stake, player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()] };
  renderBlackjack(true);
  const playerScore = handValue(blackjack.player);
  const dealerScore = handValue(blackjack.dealer);
  if (playerScore === 21 || dealerScore === 21) {
    if (playerScore === dealerScore) finishBlackjack('Remis. Stawka wraca do portfela.', '', stake, 0);
    else if (playerScore === 21) finishBlackjack(`Blackjack! Wypłata brutto ${formatPoints(stake * 2.5)} pkt.`, 'win', stake * 2.5, stake * 1.5);
    else finishBlackjack('Krupier ma blackjacka. Tym razem wygrywa krupier.', 'loss');
  } else {
    setMessage('#blackjack-message', 'Dobierz kartę albo spasuj.');
  }
});

document.querySelector('#hit-button').addEventListener('click', () => {
  if (!blackjack.active) return;
  blackjack.player.push(drawCard());
  renderBlackjack(true);
  const total = handValue(blackjack.player);
  if (total > 21) finishBlackjack(`Masz ${total}. Przekroczone 21 — wygrywa krupier.`, 'loss');
  else if (total === 21) document.querySelector('#stand-button').click();
  else setMessage('#blackjack-message', `Masz ${total}. Dobierz albo spasuj.`);
});

document.querySelector('#stand-button').addEventListener('click', () => {
  if (!blackjack.active) return;
  while (handValue(blackjack.dealer) < 17) blackjack.dealer.push(drawCard());
  const playerScore = handValue(blackjack.player);
  const dealerScore = handValue(blackjack.dealer);
  if (dealerScore > 21 || playerScore > dealerScore) finishBlackjack(`Wypłata brutto ${formatPoints(blackjack.stake * 2)} pkt.`, 'win', blackjack.stake * 2, blackjack.stake);
  else if (playerScore === dealerScore) finishBlackjack('Remis. Stawka wraca do portfela.', '', blackjack.stake, 0);
  else finishBlackjack(`Krupier ma ${dealerScore}. Tym razem wygrywa krupier.`, 'loss');
});

let selectedDice = 'low';
document.querySelectorAll('.dice-choice').forEach((button) => {
  button.addEventListener('click', () => {
    selectedDice = button.dataset.dice;
    document.querySelectorAll('.dice-choice').forEach((choice) => choice.classList.toggle('is-selected', choice === button));
  });
});

let diceBusy = false;
document.querySelector('#dice-button').addEventListener('click', () => {
  if (diceBusy) return;
  const stake = readStake('#dice-stake');
  if (stake === null) return;
  placeBet(stake);
  diceBusy = true;
  const button = document.querySelector('#dice-button');
  const dice = [document.querySelector('#die-1'), document.querySelector('#die-2')];
  dice.forEach((die) => die.classList.add('is-rolling'));
  setMessage('#dice-message', 'Kości wirują…');
  const rollAnimation = setInterval(() => {
    dice.forEach((die) => { die.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][Math.floor(Math.random() * 6)]; });
  }, 75);
  setTimeout(() => {
    clearInterval(rollAnimation);
    const values = dice.map(() => Math.floor(Math.random() * 6) + 1);
    const total = values[0] + values[1];
    dice.forEach((die, index) => {
      die.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][values[index] - 1];
      die.classList.remove('is-rolling');
    });
    document.querySelector('#dice-result').textContent = String(total);
    const won = selectedDice === 'low' ? total < 7 : selectedDice === 'high' ? total > 7 : total === 7;
    if (won) {
      const multiplier = selectedDice === 'seven' ? 5 : 2;
      const grossPayout = stake * multiplier;
      const netProfit = grossPayout - stake;
      awardPoints(grossPayout, 'KOŚCI', netProfit);
      setMessage('#dice-message', `Wypadło ${total} · wypłata ${formatPoints(grossPayout)} pkt · zysk netto +${formatPoints(netProfit)} pkt.`, 'win');
    } else {
      setMessage('#dice-message', `Wypadło ${total}. Tym razem bez wygranej.`);
    }
    diceBusy = false;
    button.disabled = false;
  }, 850);
  button.disabled = true;
});

function drawDuelCard() {
  const value = Math.floor(Math.random() * 13) + 2;
  const suit = ['♠', '♥', '♦', '♣'][Math.floor(Math.random() * 4)];
  const label = value === 14 ? 'A' : value === 13 ? 'K' : value === 12 ? 'Q' : value === 11 ? 'J' : String(value);
  return { value, label, suit, red: suit === '♥' || suit === '♦' };
}

let duelBusy = false;
document.querySelector('#duel-button').addEventListener('click', () => {
  if (duelBusy) return;
  const stake = readStake('#duel-stake');
  if (stake === null) return;
  placeBet(stake);
  duelBusy = true;
  const button = document.querySelector('#duel-button');
  const playerCard = document.querySelector('#duel-player-card');
  const dealerCard = document.querySelector('#duel-dealer-card');
  button.disabled = true;
  playerCard.classList.add('is-revealing');
  dealerCard.classList.add('is-revealing');
  setMessage('#duel-message', 'Karty są odkrywane…');
  setTimeout(() => {
    const player = drawDuelCard();
    const dealer = drawDuelCard();
    [[playerCard, player], [dealerCard, dealer]].forEach(([element, card]) => {
      element.classList.remove('card-back', 'is-revealing', 'red-card');
      if (card.red) element.classList.add('red-card');
      element.textContent = `${card.label}${card.suit}`;
    });
    if (player.value > dealer.value) {
      const grossPayout = stake * 2;
      awardPoints(grossPayout, 'POJEDYNEK KART', stake);
      setMessage('#duel-message', `Twoja karta ${player.label} bije ${dealer.label} · wypłata ${formatPoints(grossPayout)} pkt · zysk netto +${formatPoints(stake)} pkt.`, 'win');
    } else if (player.value === dealer.value) {
      awardPoints(stake, 'ZWROT STAWKI', 0);
      setMessage('#duel-message', `Remis! ${player.label} kontra ${dealer.label}. Stawka wraca do portfela.`);
    } else {
      setMessage('#duel-message', `Krupier ma ${dealer.label}, a Ty ${player.label}. Następna runda?`, 'loss');
    }
    duelBusy = false;
    button.disabled = false;
  }, 650);
});

renderBalance();
renderProfile();
renderBlackjack(false);
syncIncome();
setInterval(syncIncome, 1000);
