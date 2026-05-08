const STORAGE_PREFIX = "talk2me-chat-lastRead";

export function lastReadMap(actor) {
  if (!actor) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${actor}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getLastRead(actor, channel) {
  if (!channel) return 0;
  const n = lastReadMap(actor)[channel];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function setLastRead(actor, channel, ts) {
  if (!actor || !channel) return;
  const m = lastReadMap(actor);
  m[channel] = ts;
  localStorage.setItem(`${STORAGE_PREFIX}:${actor}`, JSON.stringify(m));
  // Allow reactive UIs to respond to read-state changes.
  try {
    window.dispatchEvent(
      new CustomEvent("talk2me:lastReadChanged", {
        detail: { actor, channel, ts },
      }),
    );
  } catch {
    // ignore
  }
}
