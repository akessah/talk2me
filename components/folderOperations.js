export function latestFolderUpdatesByPair(updates) {
  const byPair = new Map();
  for (const u of updates || []) {
    const k = `${u.value.obj}\0${u.value.target}`;
    const cur = byPair.get(k);
    if (!cur || u.value.published > cur.value.published) {
      byPair.set(k, u);
    }
  }
  return byPair;
}

export function folderTargetsContainingObject(updates, objectChannel) {
  const byPair = latestFolderUpdatesByPair(updates);
  const targets = [];
  for (const u of byPair.values()) {
    if (u.value.obj === objectChannel && u.value.activity === "Add") {
      targets.push(u.value.target);
    }
  }
  return targets;
}

export function currentFolderRecordForObject(updates, objectChannel) {
  const byPair = latestFolderUpdatesByPair(updates);
  let best = null;
  for (const u of byPair.values()) {
    if (u.value.obj !== objectChannel || u.value.activity !== "Add") continue;
    if (!best || u.value.published > best.value.published) {
      best = u;
    }
  }
  return best;
}

export function currentFolderForObject(updates, objectChannel) {
  return currentFolderRecordForObject(updates, objectChannel)?.value?.target ?? null;
}

export function isFolderDescendantOf(updates, folderChannel, possibleAncestorChannel) {
  if (!folderChannel || !possibleAncestorChannel) return false;
  let current = currentFolderForObject(updates, folderChannel);
  const visited = new Set();
  while (current && !visited.has(current)) {
    if (current === possibleAncestorChannel) return true;
    visited.add(current);
    current = currentFolderForObject(updates, current);
  }
  return false;
}

export function folderAncestorsForObject(updates, objectChannel) {
  return folderAncestorRecordsForObject(updates, objectChannel).map(
    (record) => record?.value?.target,
  );
}

export function folderAncestorRecordsForObject(updates, objectChannel) {
  const ancestors = [];
  let currentRecord = currentFolderRecordForObject(updates, objectChannel);
  const visited = new Set();
  while (currentRecord) {
    const folderChannel = currentRecord?.value?.target ?? "";
    if (!folderChannel || visited.has(folderChannel)) break;
    ancestors.push(currentRecord);
    visited.add(folderChannel);
    currentRecord = currentFolderRecordForObject(updates, folderChannel);
  }
  return ancestors;
}

export async function addObjectExclusiveToFolder({
  graffiti,
  session,
  objectChannel,
  targetFolderChannel,
  folderUpdates,
}) {
  const updates = Array.isArray(folderUpdates) ? folderUpdates : [];
  let t = Date.now();
  const nextTs = () => {
    t += 1;
    return t;
  };

  const targets = folderTargetsContainingObject(updates, objectChannel);

  for (const folderId of targets) {
    if (folderId !== targetFolderChannel) {
      await graffiti.post(
        {
          value: {
            activity: "Remove",
            obj: objectChannel,
            target: folderId,
            published: nextTs(),
          },
          allowed: [],
          channels: [`${session.actor}/folders`],
        },
        session,
      );
    }
  }

  const alreadyOnlyHere =
    targets.length === 1 && targets[0] === targetFolderChannel;
  if (alreadyOnlyHere) return;

  await graffiti.post(
    {
      value: {
        activity: "Add",
        obj: objectChannel,
        target: targetFolderChannel,
        published: nextTs(),
      },
      allowed: [],
      channels: [`${session.actor}/folders`],
    },
    session,
  );
}
