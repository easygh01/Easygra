const SUPABASE_CONFIG = window.GRAJOWNIA_SUPABASE_CONFIG || {};
const COMMUNITY_STORAGE_KEY = 'grajownia-state-v1';
const communityState = { client: null, userId: null, connected: false, channel: null };
let profileSyncTimeout;
let alertTimeout;

window.grajowniaCommunity = communityState;

const communityStatus = document.querySelector('#community-status');
const chatConnection = document.querySelector('#chat-connection');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatSend = document.querySelector('#chat-send');
const chatHelp = document.querySelector('#chat-help');
const chatMessages = document.querySelector('#chat-messages');
const leaderboard = document.querySelector('#leaderboard-list');
const bigWinsList = document.querySelector('#big-wins-list');
const bigWinsHelp = document.querySelector('#big-wins-help');
const rankingStatus = document.querySelector('#ranking-status');
const communityAlert = document.querySelector('#community-alert');

function formatCommunityPoints(points) {
  return new Intl.NumberFormat('pl-PL').format(Number(points) || 0);
}

function readLocalPlayer() {
  try {
    const state = JSON.parse(localStorage.getItem(COMMUNITY_STORAGE_KEY));
    return {
      playerName: (state?.playerName || 'Gość').trim().slice(0, 24) || 'Gość',
      points: Math.max(0, Math.floor(Number(state?.points) || 0)),
    };
  } catch {
    return { playerName: 'Gość', points: 1000 };
  }
}

function setCommunityMode(online, message = '') {
  communityState.connected = online;
  communityStatus.textContent = online ? 'ONLINE' : 'DEMO';
  communityStatus.classList.toggle('is-online', online);
  rankingStatus.textContent = online ? 'NA ŻYWO' : 'DEMO';
  rankingStatus.classList.toggle('is-online', online);
  bigWinsHelp.textContent = online
    ? 'Najnowsze trafienia graczy w czasie rzeczywistym.'
    : 'Przykładowe wygrane w trybie demonstracyjnym.';
  chatConnection.textContent = online ? 'ONLINE' : 'OFFLINE';
  chatConnection.classList.toggle('is-online', online);
  chatInput.disabled = !online;
  chatSend.disabled = !online;
  chatHelp.textContent = online
    ? 'Wiadomości widoczne dla wszystkich w klubie.'
    : message || 'Dodaj URL projektu i publiczny anon key Supabase, aby włączyć wspólną społeczność.';
  if (!online) renderLeaderboardFromLocal();
}

function renderLeaderboardFromLocal() {
  const local = readLocalPlayer();
  const players = [
    { name: 'RoyalMila', points: 128_400 },
    { name: 'NeonFox', points: 84_250 },
    { name: 'ZlotaKarta', points: 52_800 },
    { name: local.playerName, points: local.points, isPlayer: true },
  ].sort((first, second) => second.points - first.points).slice(0, 5);
  renderLeaderboard(players);
}

function renderLeaderboard(players) {
  leaderboard.replaceChildren(...players.map((player, index) => {
    const row = document.createElement('li');
    row.className = `leaderboard-entry${player.isPlayer || player.id === communityState.userId ? ' is-player' : ''}`;
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = player.player_name || player.name || 'Gość';
    const points = document.createElement('span');
    points.className = 'leaderboard-points';
    points.textContent = `${formatCommunityPoints(player.points)} pkt`;
    row.append(rank, name, points);
    return row;
  }));
}

function renderBigWins(wins) {
  bigWinsList.replaceChildren(...wins.map((win) => {
    const row = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'win-game-icon';
    icon.textContent = '✦';
    const player = document.createElement('span');
    player.className = 'win-player';
    const name = document.createElement('strong');
    name.textContent = win.player_name;
    const details = document.createElement('small');
    details.textContent = `${win.game_title} · ${formatShortTime(win.created_at)}`;
    player.append(name, details);
    const amount = document.createElement('span');
    amount.className = 'win-amount';
    amount.textContent = `+ ${formatCommunityPoints(win.points)}`;
    row.append(icon, player, amount);
    return row;
  }));
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'teraz';
  return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function showCommunityAlert(win) {
  communityAlert.textContent = `${win.player_name} wygrał(a) ${formatCommunityPoints(win.points)} pkt · ${win.game_title}`;
  communityAlert.hidden = false;
  clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => { communityAlert.hidden = true; }, 6000);
}

function addChatMessage(message) {
  const row = document.createElement('li');
  row.className = 'chat-message';
  const name = document.createElement('strong');
  name.textContent = message.player_name;
  const body = document.createElement('span');
  body.textContent = message.body;
  const time = document.createElement('time');
  time.dateTime = message.created_at;
  time.textContent = formatShortTime(message.created_at);
  row.append(name, body, time);
  chatMessages.append(row);
  while (chatMessages.children.length > 40) chatMessages.firstElementChild.remove();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function syncCurrentPlayer(profile = readLocalPlayer()) {
  if (!communityState.client || !communityState.userId) return;
  const { error } = await communityState.client.from('players').upsert({
    id: communityState.userId,
    player_name: profile.playerName,
    points: profile.points,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.warn('Nie udało się zsynchronizować profilu:', error.message);
}

async function loadLeaderboard() {
  const { data, error } = await communityState.client
    .from('players')
    .select('id, player_name, points')
    .order('points', { ascending: false })
    .limit(20);
  if (error) throw error;
  renderLeaderboard(data || []);
}

async function loadBigWins() {
  const { data, error } = await communityState.client
    .from('big_wins')
    .select('id, player_id, player_name, points, game_title, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  renderBigWins(data || []);
}

async function loadChatMessages() {
  const { data, error } = await communityState.client
    .from('chat_messages')
    .select('id, player_id, player_name, body, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  chatMessages.replaceChildren();
  (data || []).reverse().forEach(addChatMessage);
}

async function publishBigWin(detail) {
  if (!communityState.client || !communityState.userId || detail.points <= 1000) return;
  const player = readLocalPlayer();
  const { error } = await communityState.client.from('big_wins').insert({
    player_id: communityState.userId,
    player_name: player.playerName,
    points: Math.floor(detail.points),
    game_title: String(detail.title || 'Wygrana').slice(0, 80),
  });
  if (error) console.warn('Nie udało się opublikować wygranej:', error.message);
}

function subscribeToCommunity() {
  communityState.channel = communityState.client.channel('grajownia-community')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
      loadLeaderboard().catch((error) => console.warn('Nie udało się odświeżyć rankingu:', error.message));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'big_wins' }, (payload) => {
      const win = payload.new;
      showCommunityAlert(win);
      loadBigWins().catch((error) => console.warn('Nie udało się odświeżyć wygranych:', error.message));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      addChatMessage(payload.new);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setCommunityMode(true);
        loadLeaderboard().catch((error) => console.warn('Nie udało się odświeżyć rankingu:', error.message));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setCommunityMode(false, 'Utracono połączenie ze wspólnym klubem.');
      }
    });
}

async function startCommunity() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    setCommunityMode(false);
    return;
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    communityState.client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    const { data, error } = await communityState.client.auth.signInAnonymously();
    if (error) throw error;
    communityState.userId = data.user.id;
    window.addEventListener('grajownia:state', (event) => {
      clearTimeout(profileSyncTimeout);
      profileSyncTimeout = setTimeout(() => {
        syncCurrentPlayer(event.detail).catch((error) => console.warn('Błąd synchronizacji profilu:', error.message));
      }, 350);
    });
    window.addEventListener('grajownia:big-win', (event) => {
      publishBigWin(event.detail);
    });
    await syncCurrentPlayer();
    await Promise.all([loadLeaderboard(), loadBigWins(), loadChatMessages()]);
    subscribeToCommunity();
    setCommunityMode(true);
  } catch (error) {
    console.error('Nie udało się połączyć z Supabase:', error);
    setCommunityMode(false, 'Nie udało się połączyć. Sprawdź Supabase URL, anon key i włącz logowanie anonimowe.');
  }
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = chatInput.value.trim();
  if (!body || !communityState.client || !communityState.userId) return;
  chatSend.disabled = true;
  const player = readLocalPlayer();
  const { error } = await communityState.client.from('chat_messages').insert({
    player_id: communityState.userId,
    player_name: player.playerName,
    body: body.slice(0, 300),
  });
  if (error) {
    chatHelp.textContent = 'Wiadomości nie wysłano. Spróbuj ponownie.';
    chatSend.disabled = false;
    return;
  }
  chatInput.value = '';
  chatSend.disabled = false;
});

setCommunityMode(false);
startCommunity();