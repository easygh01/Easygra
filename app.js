const STORAGE_KEY = 'grajownia-state-v1';
const STARTING_POINTS = 1000;
const REWARD_INTERVAL = 60_000;
const CHEST_INTERVAL = 10 * 60_000;
const CHEST_REWARD = 10_000;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isFinite(saved.points) && Number.isFinite(saved.lastRewardAt)) {
      return {
        points: Math.max(0, Math.floor(saved.points)),
        lastRewardAt: saved.lastRewardAt,
        lastChestAt: Number.isFinite(saved.lastChestAt) ? saved.lastChestAt : Date.now(),
      };
    }
  } catch {
    // Start with a fresh balance if saved browser data is invalid.
  }
  return { points: STARTING_POINTS, lastRewardAt: Date.now(), lastChestAt: Date.now() };
}

let state = loadState();
let selectedColor = 'red';
let blackjack = { active: false, player: [], dealer: [] };
let toastTimeout;
let winBannerTimeout;

const balanceElement = document.querySelector('#balance');
const progressElement = document.querySelector('#income-progress');
const progressTrack = document.querySelector('.progress-track');
const countdownElement = document.querySelector('#countdown');
const toastElement = document.querySelector('#toast');
const winBanner = document.querySelector('#win-banner');

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatPoints(points) {
  return new Intl.NumberFormat('pl-PL').format(points);
}

function renderBalance() {
  balanceElement.textContent = formatPoints(state.points);
  document.querySelector('#table-balance').textContent = formatPoints(state.points);
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
  const remaining = CHEST_INTERVAL - (Date.now() - state.lastChestAt);

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
  const remaining = CHEST_INTERVAL - (Date.now() - state.lastChestAt);
  if (remaining > 0) {
    showToast('Skrzynka będzie gotowa za kilka minut.');
    return;
  }

  state.points += CHEST_REWARD;
  state.lastChestAt = Date.now();
  saveState();
  renderBalance();
  syncChestState();
  showWinBanner('SKRZYNKA BONUSOWA', `+ ${formatPoints(CHEST_REWARD)}`, 'pkt');
  showToast('Skrzynka otwarta! +10 000 pkt');
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

document.querySelector('#claim-chest').addEventListener('click', claimChestReward);

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

function awardPoints(points) {
  state.points += points;
  saveState();
  renderBalance();
  showWinBanner('WYGRANA', `+ ${formatPoints(points)}`, 'pkt');
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

function createSlotGame(title, machine, prompt, reelStrip, payouts, subtitle) {
  return {
    title,
    machine,
    prompt,
    subtitle,
    reels: [reelStrip, reelStrip, reelStrip],
    payouts,
    scatterSymbol: 'SCATTER',
    freeSpinsAward: 5,
  };
}

const slotGames = {
  sevens: createSlotGame('Lucky 777', 'LUCKY 777', 'TRAF 777 I ODBIERZ JACKPOT', ['7', '🍋', '🍋', '🍋', '🍊', '🍊', '🍒', '🍒', '🔔', '🔔', 'BAR', 'SCATTER'], { '7': 120, '🍋': 14, '🍊': 20, '🍒': 30, '🔔': 40, BAR: 100 }, 'Klasyczna linia 777 zgarnia 120× stawki.'),
  fruits: createSlotGame('Owocowy klub', 'FRUIT CLUB', 'OWOCOWA LINIA CZEKA', ['🍒', '🍒', '🍒', '🍋', '🍋', '🍊', '🍊', '🍇', '🍇', 'BAR', '🔔', 'SCATTER'], { '🍒': 14, '🍋': 22, '🍊': 26, '🍇': 36, BAR: 90, '🔔': 60 }, 'Klasyczne owoce i dzwonki. BAR wypłaca 90× stawki.'),
  diamonds: createSlotGame('Diamentowy', 'DIAMOND VAULT', 'OTWÓRZ DIAMENTOWY SKARBIEC', ['💎', '💎', '♦', '♦', '♦', '7', '7', 'BAR', 'BAR', '🔔', '🍒', 'SCATTER'], { '💎': 28, '♦': 20, '7': 50, BAR: 60, '🔔': 90, '🍒': 100 }, 'Diamenty, siódemki i klasyczne symbole BAR.'),
  pharaoh: createSlotGame('Skarb faraona', 'PHARAOH GOLD', 'ODKRYJ ZŁOTO FARAONÓW', ['🪲', '🪲', '🪲', '👑', '👑', '🏺', '🏺', '💍', '💍', 'BAR', '7', 'SCATTER'], { '🪲': 12, '👑': 24, '🏺': 32, '💍': 40, BAR: 75, '7': 120 }, 'Symbole skarbu i egipska linia 7 za 120× stawki.'),
  midnight: createSlotGame('Nocny neon', 'MIDNIGHT NEON', 'ZŁAP NEONOWĄ SERIĘ', ['🌙', '🌙', '🌙', '⚡', '⚡', '💎', '💎', '🔔', '🔔', 'BAR', '7', 'SCATTER'], { '🌙': 14, '⚡': 22, '💎': 30, '🔔': 44, BAR: 90, '7': 150 }, 'Neonowa seria z najwyższą linią 7 za 150×.'),
  royal: createSlotGame('Królewski dzwon', 'ROYAL BELLS', 'ZAGRAJ O KRÓLEWSKĄ LINIĘ', ['🔔', '🔔', '🔔', '🍒', '🍒', '👑', '👑', '7', '7', 'BAR', '💎', 'SCATTER'], { '🔔': 14, '🍒': 20, '👑': 32, '7': 45, BAR: 100, '💎': 120 }, 'Królewskie symbole, dzwonki i diament za 120×.'),
};
let selectedSlot = 'sevens';
let slotBusy = false;
let freeSpins = 0;
let freeSpinStake = 0;

function setReelSymbolStyle(element, symbol) {
  element.textContent = symbol;
  element.classList.toggle('seven-symbol', symbol === '7');
  element.classList.toggle('bar-symbol', symbol === 'BAR');
  element.classList.toggle('bell-symbol', symbol === '🔔');
  element.classList.toggle('diamond-symbol', symbol === '♦' || symbol === '💎');
  element.classList.toggle('scatter-symbol', symbol === 'SCATTER');
}

function setReelSymbols(reel, symbols) {
  reel.querySelectorAll('.reel-symbol').forEach((element, index) => {
    setReelSymbolStyle(element, symbols[index]);
  });
}

function renderSlotGame(game) {
  document.querySelector('#slot-title').textContent = game.title;
  document.querySelector('#slot-subtitle').textContent = game.subtitle;
  document.querySelector('#machine-name').textContent = game.machine;
  document.querySelector('#machine-prompt').textContent = game.prompt;
  document.querySelector('#slot-machine').classList.remove('is-jackpot');
  const payoutList = document.querySelector('#slot-payouts');
  payoutList.replaceChildren(...Object.entries(game.payouts).map(([symbol, multiplier]) => {
    const item = document.createElement('span');
    item.className = 'payout-item';
    const payoutSymbol = document.createElement('strong');
    payoutSymbol.textContent = symbol;
    const payoutValue = document.createElement('small');
    payoutValue.textContent = `${multiplier}×`;
    item.append(payoutSymbol, payoutValue);
    return item;
  }));
  [1, 2, 3].forEach((number) => {
    const reel = document.querySelector(`#reel-${number}`);
    const strip = game.reels[number - 1];
    setReelSymbols(reel, Array.from({ length: 3 }, () => strip[Math.floor(Math.random() * strip.length)]));
  });
  setMessage('#slot-message', 'Wygrywają tylko trójki symboli. Pary nie wypłacają.');
}

function renderFreeSpins() {
  document.querySelector('#free-spin-counter').textContent = `FREE SPINS · ${freeSpins}`;
  document.querySelector('#spin-label').textContent = freeSpins > 0 ? 'Darmowy spin' : 'Zakręć';
  document.querySelector('#slot-stake').disabled = slotBusy || freeSpins > 0;
  document.querySelector('#spin-button').disabled = slotBusy;
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

document.querySelector('#spin-button').addEventListener('click', () => {
  if (slotBusy) return;
  const isFreeSpin = freeSpins > 0;
  const stake = isFreeSpin ? freeSpinStake : readStake('#slot-stake');
  if (stake === null) return;
  if (!isFreeSpin && stake * 3 > state.points) {
    showToast('Za mało punktów na stawkę dla trzech linii.');
    return;
  }
  if (isFreeSpin) freeSpins -= 1;
  else placeBet(stake * 3);
  slotBusy = true;
  renderFreeSpins();
  const game = slotGames[selectedSlot];
  const machine = document.querySelector('#slot-machine');
  machine.classList.remove('is-jackpot');
  const reels = [1, 2, 3].map((number) => document.querySelector(`#reel-${number}`));
  const result = reels.map((reel, index) => {
    const strip = game.reels[index];
    return Array.from({ length: 3 }, () => strip[Math.floor(Math.random() * strip.length)]);
  });
  const spinIntervals = reels.map((reel, index) => {
    reel.classList.remove('is-stopped', 'is-winning');
    reel.querySelectorAll('.reel-symbol').forEach((symbol) => symbol.classList.remove('is-winning'));
    reel.classList.add('is-spinning');
    return setInterval(() => {
      const strip = game.reels[index];
      setReelSymbols(reel, Array.from({ length: 3 }, () => strip[Math.floor(Math.random() * strip.length)]));
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
    const winningLines = [0, 1, 2].flatMap((row) => {
      const symbol = result[0][row];
      const matchingLine = symbol !== game.scatterSymbol && result.every((reelResult) => reelResult[row] === symbol);
      return matchingLine && game.payouts[symbol] ? [{ row, symbol, multiplier: game.payouts[symbol] }] : [];
    });
    const totalPayout = stake * winningLines.reduce((total, line) => total + line.multiplier, 0);

    if (scatterCount >= 3) {
      if (!isFreeSpin) freeSpinStake = stake;
      freeSpins += game.freeSpinsAward;
      if (totalPayout === 0) showWinBanner('BONUS SCATTER', `+ ${game.freeSpinsAward}`, 'DARMOWYCH SPINÓW');
    }
    if (totalPayout > 0) {
      winningLines.forEach(({ row }) => {
        reels.forEach((reel) => reel.querySelectorAll('.reel-symbol')[row].classList.add('is-winning'));
      });
      awardPoints(totalPayout);
      const lineLabels = winningLines.map(({ row }) => row + 1).join(', ');
      const bonusMessage = scatterCount >= 3 ? ` · +${game.freeSpinsAward} DARMOWYCH SPINÓW` : '';
      setMessage('#slot-message', `LINIA ${lineLabels} · WYGRANA ${formatPoints(totalPayout)} PKT${bonusMessage}`, 'win');
      if (winningLines.some(({ symbol }) => symbol === '7' || symbol === '💎')) machine.classList.add('is-jackpot');
    } else if (scatterCount >= 3) {
      setMessage('#slot-message', `BONUS! ${freeSpins} darmowych spinów.`, 'win');
    } else {
      setMessage('#slot-message', isFreeSpin ? 'Darmowy spin bez wygranej. Bonus trwa dalej.' : 'Brak wygranej na 3 liniach. Następny spin?');
    }
    slotBusy = false;
    renderFreeSpins();
  }, 1950);
});

function updateSlotTotal() {
  const stake = Math.floor(Number(document.querySelector('#slot-stake').value));
  document.querySelector('#slot-total-bet').textContent = Number.isFinite(stake) && stake > 0 ? `${formatPoints(stake * 3)} pkt` : '—';
}

document.querySelector('#slot-stake').addEventListener('input', updateSlotTotal);

renderSlotGame(slotGames[selectedSlot]);
renderFreeSpins();
updateSlotTotal();
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
      awardPoints(stake * multiplier);
      setMessage('#roulette-message', `Trafiony ${colorNames[color].toLowerCase()}! Wygrywasz ${formatPoints(stake * multiplier)} pkt.`, 'win');
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

function finishBlackjack(message, result, payout = 0) {
  blackjack.active = false;
  if (payout > 0) awardPoints(payout);
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
    if (playerScore === dealerScore) finishBlackjack('Remis! Stawka wraca do Twojego portfela.', '', stake);
    else if (playerScore === 21) finishBlackjack(`Blackjack! Wygrywasz ${formatPoints(stake * 2.5)} pkt.`, 'win', stake * 2.5);
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
  if (dealerScore > 21 || playerScore > dealerScore) finishBlackjack(`Wygrywasz ${formatPoints(blackjack.stake * 2)} pkt.`, 'win', blackjack.stake * 2);
  else if (playerScore === dealerScore) finishBlackjack('Remis! Stawka wraca do Twojego portfela.', '', blackjack.stake);
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
      awardPoints(stake * multiplier);
      setMessage('#dice-message', `Wypadło ${total}! Wygrywasz ${formatPoints(stake * multiplier)} pkt.`, 'win');
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
      awardPoints(stake * 2);
      setMessage('#duel-message', `Twoja karta ${player.label} bije ${dealer.label}. Wygrywasz ${formatPoints(stake * 2)} pkt.`, 'win');
    } else if (player.value === dealer.value) {
      awardPoints(stake);
      setMessage('#duel-message', `Remis! ${player.label} kontra ${dealer.label}. Stawka wraca do portfela.`);
    } else {
      setMessage('#duel-message', `Krupier ma ${dealer.label}, a Ty ${player.label}. Następna runda?`, 'loss');
    }
    duelBusy = false;
    button.disabled = false;
  }, 650);
});

renderBalance();
renderBlackjack(false);
syncIncome();
setInterval(syncIncome, 1000);
