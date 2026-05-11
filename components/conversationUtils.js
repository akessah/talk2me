export function uniqueAllowedActors(conversation) {
  const allowed = Array.isArray(conversation?.allowed) ? conversation.allowed : [];
  const creator = conversation?.actor ?? "";
  return Array.from(new Set([creator, ...allowed].filter(Boolean)));
}

export function isDirectConversationBetween(conversation, actorA, actorB) {
  if (!actorA || !actorB || actorA === actorB) return false;
  const actors = uniqueAllowedActors(conversation);
  return (
    actors.length === 2 &&
    actors.includes(actorA) &&
    actors.includes(actorB)
  );
}

export function isConversationSharedWithActors(conversation, actors) {
  const uniqueActors = uniqueAllowedActors(conversation);
  return actors.every((actor) => actor && uniqueActors.includes(actor));
}
