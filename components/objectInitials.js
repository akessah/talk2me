/**
 * Initials rules (matches contacts list): multi-word → first + last initial,
 * single token → first two letters, one char → that letter.
 */
export function initialsFromLabel(raw) {
  const text = (raw ?? "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0].charAt(0);
    const b = parts[parts.length - 1].charAt(0);
    return (a + b).toUpperCase();
  }
  const word = parts[0];
  if (word.length >= 2) {
    return word.slice(0, 2).toUpperCase();
  }
  return word.toUpperCase();
}

function contactActorId(c) {
  const v = c?.value;
  return v?.actorId ?? v?.actor ?? "";
}

/**
 * Chat/Group: initials from the first matching contact in `allowed` (excluding
 * `sessionActor`). Otherwise same as title-based initials. Folders: not used here.
 */
export function sidebarObjectInitials(obj, contacts, sessionActor) {
  const type = obj?.value?.type;
  if (type !== "Chat" && type !== "Group") {
    return initialsFromLabel(obj?.value?.title ?? "");
  }
  if (sessionActor == null || sessionActor === "") {
    return initialsFromLabel(obj?.value?.title ?? "");
  }
  const allowed = Array.isArray(obj?.allowed) ? obj.allowed : [];
  const others = allowed.filter((a) => a && a !== sessionActor);
  const list = Array.isArray(contacts) ? contacts : [];
  for (const actor of others) {
    const c = list.find((x) => contactActorId(x) === actor);
    if (c?.value) {
      return initialsFromLabel(c.value.username ?? c.value.handle ?? "");
    }
  }
  return initialsFromLabel(obj?.value?.title ?? "");
}
