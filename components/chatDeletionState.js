const STORAGE_PREFIX = "talk2me-chat-deletionCutoffs";

export function chatDeletionCutoffMap(actor) {
  if (!actor) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${actor}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setLocalChatDeletionCutoff(actor, channel, ts) {
  if (!actor || !channel) return;
  const nextTs = Number(ts);
  if (!Number.isFinite(nextTs)) return;
  const map = chatDeletionCutoffMap(actor);
  map[channel] = nextTs;
  localStorage.setItem(`${STORAGE_PREFIX}:${actor}`, JSON.stringify(map));
  try {
    window.dispatchEvent(
      new CustomEvent("talk2me:chatDeletionChanged", {
        detail: { actor, channel, ts: nextTs },
      }),
    );
  } catch {
    // ignore
  }
}

export function clearLocalChatDeletionCutoff(actor, channel) {
  if (!actor || !channel) return;
  const map = chatDeletionCutoffMap(actor);
  if (!(channel in map)) return;
  delete map[channel];
  localStorage.setItem(`${STORAGE_PREFIX}:${actor}`, JSON.stringify(map));
  try {
    window.dispatchEvent(
      new CustomEvent("talk2me:chatDeletionChanged", {
        detail: { actor, channel, ts: 0 },
      }),
    );
  } catch {
    // ignore
  }
}
