export function uniqueAllowedActors(conversation) {
  // Graffiti masks `allowed` for non-creators (it only contains the
  // querying actor), so prefer the unmasked `value.participants` list
  // when the chat object provides it. Fall back to `allowed` for older
  // chats that pre-date the participants-in-value migration.
  const valueParticipants = Array.isArray(
    conversation?.value?.participants,
  )
    ? conversation.value.participants
    : [];
  const allowed = Array.isArray(conversation?.allowed) ? conversation.allowed : [];
  const creator = conversation?.actor ?? "";
  return Array.from(
    new Set(
      [creator, ...valueParticipants, ...allowed].filter(Boolean),
    ),
  );
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
