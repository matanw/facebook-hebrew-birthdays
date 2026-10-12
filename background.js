import { load, saveFriends, upcoming, mergeScraped } from './store.js';
import { formatHebrew, today } from './hebdate.js';

const BIRTHDAYS_URL = 'https://www.facebook.com/events/birthdays';

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

async function setup() {
  await chrome.alarms.create('tick', { periodInMinutes: 30, delayInMinutes: 0.1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick') await tick();
  if (alarm.name === 'sync-timeout') await finishSync(null);
});

async function tick() {
  const { friends, settings, notified, lastSync } = await load();
  await notify(friends, settings, notified);
  await updateBadge(friends);
  const due = !lastSync || Date.now() - lastSync > settings.syncEveryDays * 864e5;
  if (settings.autoSync && due) await startSync();
}

// ---------- Sync: open the birthdays page in a background tab, let content.js read it ----------

async function startSync() {
  const { syncTabId } = await chrome.storage.session.get('syncTabId');
  if (syncTabId) return;
  const tab = await chrome.tabs.create({ url: BIRTHDAYS_URL, active: false });
  await chrome.storage.session.set({ syncTabId: tab.id, syncStatus: 'running' });
  await chrome.alarms.create('sync-timeout', { delayInMinutes: 1 });
}

async function finishSync(status) {
  const { syncTabId } = await chrome.storage.session.get('syncTabId');
  if (syncTabId) {
    try { await chrome.tabs.remove(syncTabId); } catch { /* already closed */ }
  }
  await chrome.alarms.clear('sync-timeout');
  await chrome.storage.session.set({ syncTabId: null, syncStatus: status ?? 'failed' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'birthdays-scraped') {
    handleScraped(msg, sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'sync-now') {
    startSync().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'refresh') {
    load().then(({ friends }) => updateBadge(friends)).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleScraped(msg, tabId) {
  const { friends } = await load();
  const { syncTabId } = await chrome.storage.session.get('syncTabId');
  if (msg.friends.length) {
    const added = mergeScraped(friends, msg.friends);
    await saveFriends(friends);
    await chrome.storage.local.set({ lastSync: Date.now() });
    await chrome.storage.session.set({ lastSyncAdded: added });
    await updateBadge(friends);
  }
  if (tabId && tabId === syncTabId) {
    await finishSync(msg.failed ? 'failed' : 'ok');
  }
}

// ---------- Notifications ----------

async function notify(friends, settings, notified) {
  if (new Date().getHours() < settings.notifyHour) return;
  const offsets = new Set([0, settings.daysBefore]);
  const todayIso = today().toISOString().slice(0, 10);

  for (const f of upcoming(friends)) {
    if (!offsets.has(f.inDays)) continue;
    const key = `${f.id}|${f.next.date.toISOString().slice(0, 10)}|${f.inDays}`;
    if (notified[key]) continue;
    const when = f.inDays === 0 ? 'היום' : f.inDays === 1 ? 'מחר' : `בעוד ${f.inDays} ימים`;
    const options = {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${when} יום ההולדת העברי של ${f.name}`,
      message: `${formatHebrew(f.next.hebrew)} · ${f.next.age}`,
      priority: 1,
    };
    if (f.url) {
      options.contextMessage = 'לחיצה פותחת את הוול לכתיבת ברכה';
      options.buttons = [{ title: 'כתוב ברכה בוול' }];
    }
    await chrome.notifications.create(`bd|${f.id}|${key}`, options);
    notified[key] = todayIso;
  }
  // Forget entries older than ~2 weeks.
  for (const [k, d] of Object.entries(notified)) {
    if (Date.parse(d) < Date.now() - 14 * 864e5) delete notified[k];
  }
  await chrome.storage.local.set({ notified });
}

async function openWall(notifId) {
  const id = notifId.split('|')[1];
  const { friends } = await load();
  if (friends[id]?.url) chrome.tabs.create({ url: friends[id].url });
  chrome.notifications.clear(notifId);
}

chrome.notifications.onClicked.addListener(openWall);
chrome.notifications.onButtonClicked.addListener(openWall);

async function updateBadge(friends) {
  const soon = upcoming(friends).filter((f) => f.inDays <= 7);
  const todayCount = soon.filter((f) => f.inDays === 0).length;
  await chrome.action.setBadgeText({ text: soon.length ? String(soon.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: todayCount ? '#D85A30' : '#534AB7' });
}
