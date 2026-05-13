import { ref, toRefs, computed, watch, onUnmounted, nextTick, inject } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";
import { setLastRead } from "../chatReadState.js";

const messageDiscoverOpts = {
  properties: {
    value: {
      required: ["content", "published"],
      properties: {
        content: { type: "string" },
        published: { type: "number" },
        tombstone: { type: "boolean" },
        chatChannel: { type: "string" },
      },
    },
  },
};

const participantDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "type", "actorId", "published"],
      properties: {
        activity: { enum: ["Add", "Remove"] },
        type: { const: "Participant" },
        actorId: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

export default {
  props: {
    // messages: { type: Object, required: true },
    folders: { type: Object, required: true },
    folderUpdates: { type: [Array, Object], default: () => [] },
    allObjects: { type: Array, default: () => [] },
    // openChat: { type: Object, default: undefined },
    openChatChannel: { type: String, default: "" },
    openChat: { type: Object, default: undefined },
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },
    appName: { type: String, required: true },
    contacts: { type: Array, default: () => [] },
    folderNavStack: { type: Array, required: true},
    folderBack: { type: Function, required: true},
    chatDeletionCutoffs: { type: Object, default: () => new Map() },
    mutedChatChannels: { type: Object, default: () => new Set() },
    mutedFolderChannels: { type: Object, default: () => new Set() },
    prefetchedMessagesByChannel: { type: Object, default: () => new Map() },
    prefetchedParticipantUpdatesByChannel: { type: Object, default: () => new Map() },
  },
  setup(props) {
    const pendingChatCreations = inject("pendingChatCreations", null);

    const isCreatingOpenChat = computed(() => {
      const ref = pendingChatCreations;
      const set = ref && "value" in ref ? ref.value : ref;
      if (!set || typeof set.has !== "function") return false;
      return Boolean(props.openChatChannel) && set.has(props.openChatChannel);
    });

    const { objects: messages } = useGraffitiDiscover(
        () => [props.openChatChannel],
        messageDiscoverOpts,
        props.session,
        true,
    );

    const { objects: participantUpdates } = useGraffitiDiscover(
      () => [props.openChatChannel],
      participantDiscoverOpts,
      props.session,
      true,
    );

    function mapValueForChannel(mapLike, channel) {
      if (!channel || !mapLike || typeof mapLike.get !== "function") return [];
      const value = mapLike.get(channel);
      return Array.isArray(value) ? value : [];
    }

    const prefetchedMessages = computed(() =>
      mapValueForChannel(props.prefetchedMessagesByChannel, props.openChatChannel),
    );

    const prefetchedParticipantUpdates = computed(() =>
      mapValueForChannel(
        props.prefetchedParticipantUpdatesByChannel,
        props.openChatChannel,
      ),
    );

    // const openChat = computed(() =>
    //     props.allObjects.find(
    //       (chat) => chat.value.channel === props.openChatChannel
    //     )
    // );

    const newMessage = ref("");
    const participantsDetailsRef = ref(null);
    const messageInputRef = ref(null);
    const messageThreadRef = ref(null);
    const userPinnedToBottom = ref(true);
    const optimisticMessages = ref([]);

    const newParticipantInput = ref("");
    const addParticipantError = ref(false);
    const addParticipantErrorMessage = ref(
      "This graffiti handle was not found. Please try again.",
    );
    const addParticipantShake = ref(false);
    const addParticipantSubmitting = ref(false);
    const actorHandleCache = ref(new Map());
    const actorHandlePending = new Set();

    const ADD_PARTICIPANT_SHAKE_MS = 450;

    function clearAddParticipantShake() {
      addParticipantShake.value = false;
    }

    async function triggerAddParticipantShake() {
      addParticipantShake.value = false;
      await nextTick();
      addParticipantShake.value = true;
      setTimeout(clearAddParticipantShake, ADD_PARTICIPANT_SHAKE_MS);
    }

    watch(newParticipantInput, () => {
      addParticipantError.value = false;
      addParticipantErrorMessage.value =
        "This graffiti handle was not found. Please try again.";
    });

    watch(newMessage, resizeMessageInput);

    function isNearBottom(el) {
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }

    function onMessageThreadScroll() {
      const el = messageThreadRef.value;
      userPinnedToBottom.value = isNearBottom(el);
    }

    async function scrollMessagesToBottom() {
      await nextTick();
      const el = messageThreadRef.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }

    async function resizeMessageInput() {
      await nextTick();
      const el = messageInputRef.value;
      if (!el) return;
      el.style.height = "auto";
      const maxHeight = Number.parseFloat(getComputedStyle(el).maxHeight);
      const nextHeight = Number.isFinite(maxHeight)
        ? Math.min(el.scrollHeight, maxHeight)
        : el.scrollHeight;
      el.style.height = `${nextHeight}px`;
      el.style.overflowY = el.scrollHeight > nextHeight ? "auto" : "hidden";
    }

    function closeParticipants() {
      const el = participantsDetailsRef.value;
      if (!el) return;
      el.open = false;
    }

    function onDocumentClick(e) {
      const el = participantsDetailsRef.value;
      if (!el?.open) return;
      const t = e.target;
      if (el.contains(t)) return;
      closeParticipants();
    }

    function onParticipantsToggle() {
      const el = participantsDetailsRef.value;
      if (!el) return;
      if (el.open) document.addEventListener("click", onDocumentClick);
      else document.removeEventListener("click", onDocumentClick);
    }

    onUnmounted(() => {
      document.removeEventListener("click", onDocumentClick);
    });

    const hasOpenChat = computed(() =>
      ["Chat", "Group"].includes(props.openChat?.value?.type),
    );

    const canAddParticipants = computed(() => {
      const chat = props.openChat;
      const sessionActor = props.session?.actor ?? "";
      if (!chat || !sessionActor) return false;
      return chat.actor === sessionActor;
    });

    function contactActorId(c) {
      const v = c?.value;
      return v?.actorId ?? v?.actor ?? "";
    }

    function latestContactForActor(actor) {
      const list = Array.isArray(props.contacts) ? props.contacts : [];
      let best = null;
      for (const c of list) {
        if (contactActorId(c) !== actor) continue;
        if (!best || (c?.value?.published ?? 0) > (best?.value?.published ?? 0)) {
          best = c;
        }
      }
      return best;
    }

    function cachedHandleForActor(actor) {
      return actorHandleCache.value.get(actor) ?? "";
    }

    async function warmActorHandle(actor) {
      if (!actor) return;
      if (latestContactForActor(actor)) return;
      if (actorHandleCache.value.has(actor) || actorHandlePending.has(actor)) return;
      if (typeof props.graffiti.actorToHandle !== "function") return;

      actorHandlePending.add(actor);
      try {
        const resolved = await props.graffiti.actorToHandle(actor);
        const handle = String(resolved ?? "")
          .replace(/\.graffiti\.actor$/i, "")
          .trim();
        if (!handle) return;
        const next = new Map(actorHandleCache.value);
        next.set(actor, handle);
        actorHandleCache.value = next;
      } catch {
        // Best-effort cache warming only.
      } finally {
        actorHandlePending.delete(actor);
      }
    }

    function findContactByUsername(query) {
      if (!query) return null;
      const list = Array.isArray(props.contacts) ? props.contacts : [];
      const matches = list
        .filter((c) => c?.value?.username === query)
        .sort(
          (a, b) => (b?.value?.published ?? 0) - (a?.value?.published ?? 0),
        );
      return matches.length ? matches[0] : null;
    }

    async function resolveParticipantQuery(query) {
      const trimmed = query.trim();
      if (!trimmed) return null;

      const contactMatch = findContactByUsername(trimmed);
      if (contactMatch) {
        const actor = contactActorId(contactMatch);
        if (!actor) return null;
        return {
          actor,
          handle: contactMatch.value.handle || trimmed,
          shouldPostContact: false,
        };
      }

      try {
        const resolved = await props.graffiti.handleToActor(
          `${trimmed}.graffiti.actor`,
        );
        const actor =
          typeof resolved === "string" ? resolved : resolved?.actor ?? "";
        if (!actor) return null;
        return { actor, handle: trimmed, shouldPostContact: true };
      } catch (e) {
        return null;
      }
    }

    const participants = computed(() => {
      if (!hasOpenChat.value) return [];
      const sessionActor = props.session?.actor ?? "";
      const updates = [
        ...prefetchedParticipantUpdates.value,
        ...(Array.isArray(participantUpdates?.value)
          ? participantUpdates.value
          : Array.isArray(participantUpdates)
            ? participantUpdates
            : []),
      ];
      // `value.participants` is the unmasked, authoritative member list
      // written by the chat creator. Non-creators see Graffiti's `allowed`
      // array masked to only contain themselves, so prefer
      // `value.participants` when available and fall back to `allowed`
      // (and self) for older chats that don't carry the field yet.
      const valueParticipants = Array.isArray(
        props.openChat?.value?.participants,
      )
        ? props.openChat.value.participants
        : [];
      const baseActors = new Set([
        props.openChat?.actor,
        ...valueParticipants,
        ...(Array.isArray(props.openChat?.allowed) ? props.openChat.allowed : []),
        sessionActor,
      ].filter(Boolean));

      // Apply latest Add/Remove per actorId on top of the chat object's stored
      // participant baseline so the list renders immediately on chat open.
      const latestByActor = new Map();
      for (const u of updates) {
        const actorId = u?.value?.actorId;
        const published = u?.value?.published ?? 0;
        if (!actorId) continue;
        const cur = latestByActor.get(actorId);
        if (!cur || published > (cur?.value?.published ?? 0)) {
          latestByActor.set(actorId, u);
        }
      }

      for (const [actorId, u] of latestByActor.entries()) {
        if (u?.value?.activity === "Add") baseActors.add(actorId);
        else if (u?.value?.activity === "Remove") baseActors.delete(actorId);
      }

      // Always include self so the list doesn't look empty.
      const unique = new Set([sessionActor, ...baseActors].filter(Boolean));
      return Array.from(unique).map((actor) => {
        const c = latestContactForActor(actor);
        const username = c?.value?.username ?? "";
        const handle = c?.value?.handle ?? "";
        // If we have a saved contact, prefer showing the contact's username.
        const label = c
          ? (username || handle || "")
          : (cachedHandleForActor(actor) || "");
        return {
          actor,
          label,
          isSelf: actor === sessionActor,
          hasContact: Boolean(c?.value?.handle),
          contactHandle: c?.value?.handle ?? "",
        };
      });
    });

    async function promptCreateContactForActor(actor) {
      if (!actor || actor === props.session?.actor) return;

      // If Graffiti supports actor->handle, use it as a default. Otherwise ask.
      let suggested = cachedHandleForActor(actor);
      try {
        if (!suggested && typeof props.graffiti.actorToHandle === "function") {
          suggested = await props.graffiti.actorToHandle(actor);
        }
      } catch {
        // ignore and fall back to manual entry
      }
      const suggestedHandle = (suggested ?? "")
        .replace(/\.graffiti\.actor$/i, "")
        .trim();

      const handle = suggestedHandle || actor;
      const username = window
        .prompt(
          "Create a contact for this participant.\n\nUsername:",
          "",
        )
        ?.trim();
      if (!username) return;

      await props.graffiti.post(
        {
          value: {
            actorId: actor,
            username,
            handle,
            published: Date.now(),
          },
          allowed: [],
          channels: [`${props.session.actor} contacts`, "my contacts"],
        },
        props.session,
      );
    }

    function isAlreadyParticipant(actor) {
      if (!actor) return false;
      return participants.value.some((p) => p.actor === actor);
    }

    async function addParticipant() {
      if (addParticipantSubmitting.value) return;
      const query = newParticipantInput.value;
      if (!query.trim()) return;
      const chat = props.openChat;
      const sessionActor = props.session?.actor ?? "";
      if (!chat?.value || !sessionActor || !props.openChatChannel) return;

      addParticipantSubmitting.value = true;
      try {
        const resolved = await resolveParticipantQuery(query);
        if (!resolved) {
          addParticipantError.value = true;
          addParticipantErrorMessage.value =
            "This graffiti handle was not found. Please try again.";
          triggerAddParticipantShake();
          return;
        }

        if (resolved.actor === sessionActor) {
          addParticipantError.value = true;
          addParticipantErrorMessage.value = "You can't add yourself to the chat.";
          triggerAddParticipantShake();
          return;
        }

        if (isAlreadyParticipant(resolved.actor)) {
          newParticipantInput.value = "";
          addParticipantError.value = false;
          addParticipantErrorMessage.value =
            "This graffiti handle was not found. Please try again.";
          return;
        }

        // Base the new allowed list on the *effective* participant list
        // (chat.actor + chat.value.participants + chat.allowed +
        // participant Add/Remove records), not just chat.allowed. Graffiti
        // masks `allowed` to only contain the querying actor for non-
        // creators, so we can't trust `chat.allowed` to enumerate everyone.
        const effectiveActors = participants.value.map((p) => p.actor);
        const newAllowed = Array.from(
          new Set(
            [...effectiveActors, resolved.actor].filter(
              (actor) => actor && actor !== sessionActor,
            ),
          ),
        );
        // Full member list for `value.participants` (includes creator,
        // since the creator is also a participant). This is stored in the
        // chat's value field so non-creators can read it -- value isn't
        // masked by Graffiti the way `allowed` is.
        const newValueParticipants = Array.from(
          new Set([
            chat.actor,
            ...effectiveActors,
            resolved.actor,
          ].filter(Boolean)),
        );
        const isCreator = chat.actor === sessionActor;
        const repostPublished = Date.now();

        // The chat object's `allowed` list gates whether a new participant
        // can discover the chat at all. Only the creator can rewrite it
        // (delete + re-post). Post first then delete so the panel doesn't
        // flicker out for current participants while we swap. Bump
        // `value.published` so the global dedupe-by-channel logic in
        // main.js picks the new version over the old one for everyone.
        if (isCreator) {
          const channelsForRepost =
            Array.isArray(chat.channels) && chat.channels.length
              ? chat.channels
              : [
                  `${props.appName} chats`,
                  `${sessionActor}/chats`,
                ];
          try {
            await props.graffiti.post(
              {
                value: {
                  ...chat.value,
                  published: repostPublished,
                  participants: newValueParticipants,
                },
                allowed: newAllowed,
                channels: channelsForRepost,
              },
              props.session,
            );
            try {
              await props.graffiti.delete(chat, props.session);
            } catch (e) {
              console.error(e);
            }
          } catch (e) {
            console.error(e);
          }
        }

        try {
          await props.graffiti.post(
            {
              value: {
                activity: "Add",
                type: "Participant",
                actorId: resolved.actor,
                published: Date.now(),
              },
              allowed: newAllowed,
              channels: [props.openChatChannel],
            },
            props.session,
          );
        } catch (e) {
          console.error(e);
        }

        if (resolved.shouldPostContact) {
          const list = Array.isArray(props.contacts) ? props.contacts : [];
          const alreadyContact = list.some(
            (c) => contactActorId(c) === resolved.actor,
          );
          if (!alreadyContact) {
            try {
              await props.graffiti.post(
                {
                  value: {
                    actorId: resolved.actor,
                    username: resolved.handle,
                    handle: resolved.handle,
                    published: Date.now(),
                  },
                  allowed: [],
                  channels: [`${sessionActor} contacts`, "my contacts"],
                },
                props.session,
              );
            } catch (e) {
              console.error(e);
            }
          }
        }

        newParticipantInput.value = "";
        addParticipantError.value = false;
        addParticipantErrorMessage.value =
          "This graffiti handle was not found. Please try again.";
      } catch (e) {
        console.error(e);
        addParticipantError.value = true;
        addParticipantErrorMessage.value =
          "This graffiti handle was not found. Please try again.";
        triggerAddParticipantShake();
      } finally {
        addParticipantSubmitting.value = false;
      }
    }

    function isOwnMessage(message) {
      return (
        props.session?.actor != null &&
        message.actor === props.session.actor
      );
    }

    function isTombstone(message) {
      return message?.value?.tombstone === true;
    }

    const expandedMessageKeys = ref(new Set());

    const withdrawingMessageKeys = ref(new Set());

    async function withdrawMessage(message) {
      if (
        !props.openChatChannel ||
        !isOwnMessage(message) ||
        isTombstone(message)
      ) {
        return;
      }
      const k = messageKey(message);
      if (withdrawingMessageKeys.value.has(k)) return;
      withdrawingMessageKeys.value = new Set(withdrawingMessageKeys.value).add(
        k,
      );

      const published = message.value?.published ?? Date.now();
      try {
        await props.graffiti.delete(message, props.session);
        await props.graffiti.post(
          {
            value: {
              content: "",
              published,
              tombstone: true,
              chatChannel: props.openChatChannel,
            },
            channels: [
              props.openChatChannel,
              `${props.appName} messages`,
            ],
          },
          props.session,
        );
      } catch (e) {
        console.error(e);
      } finally {
        const nw = new Set(withdrawingMessageKeys.value);
        nw.delete(k);
        withdrawingMessageKeys.value = nw;
      }

      const expandedNext = new Set(expandedMessageKeys.value);
      expandedNext.delete(k);
      expandedMessageKeys.value = expandedNext;
    }

    function messageKey(message) {
      return `${message?.actor ?? ""}\0${message?.value?.published ?? 0}\0${message?.value?.content ?? ""}`;
    }

    function isOptimistic(message) {
      return message?.__optimistic === true;
    }

    function isPendingMessage(message) {
      return message?.__status === "pending";
    }

    function isFailedMessage(message) {
      return message?.__status === "failed";
    }

    function hasRealMessageForOptimistic(opt) {
      const raw = messages?.value;
      const list = Array.isArray(raw) ? raw : [];
      const key = messageKey(opt);
      return list.some((m) => messageKey(m) === key);
    }

    const displayedMessages = computed(() => {
      const raw = messages?.value;
      const liveList = Array.isArray(raw) ? raw : [];
      const prefetched = Array.isArray(prefetchedMessages.value)
        ? prefetchedMessages.value
        : [];
      const opts = Array.isArray(optimisticMessages.value)
        ? optimisticMessages.value
        : [];

      const filteredOpts = opts.filter((m) => !hasRealMessageForOptimistic(m));
      const deduped = new Map();
      for (const message of [...prefetched, ...liveList, ...filteredOpts]) {
        const key = message?.url || message?.__tempId || messageKey(message);
        deduped.set(key, message);
      }
      const combined = Array.from(deduped.values());
      combined.sort((a, b) => (a?.value?.published ?? 0) - (b?.value?.published ?? 0));

      const cuts = props.chatDeletionCutoffs;
      const cutoff =
        cuts && typeof cuts.get === "function"
          ? cuts.get(props.openChatChannel) ?? 0
          : 0;
      if (cutoff > 0) {
        return combined.filter((m) => (m?.value?.published ?? 0) > cutoff);
      }
      return combined;
    });

    const actorsNeedingHandleResolution = computed(() => {
      const actors = new Set();
      for (const participant of participants.value) {
        if (participant?.actor && !participant?.label && !participant?.isSelf) {
          actors.add(participant.actor);
        }
      }
      for (const message of displayedMessages.value) {
        const actor = message?.actor;
        if (!actor || actor === props.session?.actor) continue;
        if (messageDisplayName(actor)) continue;
        actors.add(actor);
      }
      return Array.from(actors);
    });

    watch(
      actorsNeedingHandleResolution,
      (actors) => {
        for (const actor of actors) {
          warmActorHandle(actor);
        }
      },
      { immediate: true },
    );

    function isMessageExpanded(message) {
      return expandedMessageKeys.value.has(messageKey(message));
    }

    function toggleMessageExpanded(message) {
      const k = messageKey(message);
      const next = new Set(expandedMessageKeys.value);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      expandedMessageKeys.value = next;
    }

    function messageDisplayName(actor) {
      const c = latestContactForActor(actor);
      return c?.value?.username ?? cachedHandleForActor(actor);
    }

    function formatMessageTime(published) {
      const ts = Number(published);
      if (!Number.isFinite(ts)) return "";
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    async function sendMessage(message) {
      const content = String(message ?? "").trim();
      if (!content || !props.openChatChannel) return;
      if (isCreatingOpenChat.value) return;

      const published = Date.now();
      const tempId = `${props.session?.actor ?? ""}\0${published}\0${content}\0${Math.random().toString(16).slice(2)}`;
      const optimistic = {
        __optimistic: true,
        __status: "pending",
        __justSent: true,
        __tempId: tempId,
        actor: props.session?.actor ?? "",
        value: {
          content,
          published,
          chatChannel: props.openChatChannel,
        },
      };
      optimisticMessages.value = [...optimisticMessages.value, optimistic];
      if (newMessage.value === message) {
        newMessage.value = "";
        resizeMessageInput();
      }

      userPinnedToBottom.value = true;
      scrollMessagesToBottom();

      window.setTimeout(() => {
        optimistic.__justSent = false;
      }, 320);

      try {
        await props.graffiti.post(
          {
            value: {
              content,
              published,
              chatChannel: props.openChatChannel,
            },
            channels: [props.openChatChannel, `${props.appName} messages`],
          },
          props.session
        );

        // Un-grey immediately on success.
        optimistic.__status = "sent";
      } catch (e) {
        optimistic.__status = "failed";
        if (!newMessage.value.trim()) {
          newMessage.value = content;
          resizeMessageInput();
        }
        console.error(e);
        return;
      }

      // Post per-recipient notification objects so unread/bell works reliably.
      const recipients = (participants.value || [])
        .map((p) => p?.actor)
        .filter((a) => a && a !== props.session?.actor);
      for (const actorId of recipients) {
        try {
          await props.graffiti.post(
            {
              value: {
                type: "Notification",
                activity: "Message",
                chatChannel: props.openChatChannel,
                messagePublished: published,
                fromActor: props.session?.actor ?? "",
                preview: content.slice(0, 140),
                published: Date.now(),
              },
              allowed: [actorId],
              channels: [`${actorId}/notifications`],
            },
            props.session,
          );
        } catch (e) {
          console.error(e);
        }
      }
    }

    watch(
      () => [props.session?.actor, props.openChatChannel],
      ([actor, ch]) => {
        if (actor && ch) {
          setLastRead(actor, ch, Date.now());
        }
      },
      { immediate: true },
    );

    watch(
      () => props.openChatChannel,
      async () => {
        userPinnedToBottom.value = true;
        await scrollMessagesToBottom();
      },
    );

    watch(
      displayedMessages,
      async () => {
        if (userPinnedToBottom.value) {
          await scrollMessagesToBottom();
        }
      },
      { deep: true },
    );

    watch(
      () => props.openChatChannel,
      () => {
        newMessage.value = "";
        expandedMessageKeys.value = new Set();
        closeParticipants();
        newParticipantInput.value = "";
        addParticipantError.value = false;
        addParticipantErrorMessage.value =
          "This graffiti handle was not found. Please try again.";
        addParticipantShake.value = false;
      },
    );

    watch(hasOpenChat, (open) => {
      if (!open) {
        newMessage.value = "";
        expandedMessageKeys.value = new Set();
        closeParticipants();
        newParticipantInput.value = "";
        addParticipantError.value = false;
        addParticipantErrorMessage.value =
          "This graffiti handle was not found. Please try again.";
        addParticipantShake.value = false;
      }
    });

    return {
      ...toRefs(props),
      messages,
      displayedMessages,
      participantUpdates,
      sendMessage,
      newMessage,
      isOwnMessage,
      isTombstone,
      isOptimistic,
      isPendingMessage,
      isFailedMessage,
      withdrawMessage,
      hasOpenChat,
      canAddParticipants,
      isCreatingOpenChat,
      participants,
      promptCreateContactForActor,
      newParticipantInput,
      addParticipantError,
      addParticipantErrorMessage,
      addParticipantShake,
      addParticipantSubmitting,
      addParticipant,
      clearAddParticipantShake,
      isMessageExpanded,
      toggleMessageExpanded,
      messageDisplayName,
      formatMessageTime,
      participantsDetailsRef,
      onParticipantsToggle,
      messageInputRef,
      resizeMessageInput,
      messageThreadRef,
      onMessageThreadScroll,
    //   openChat,
    //   folderNavStack,
    //   folderBack,
    };
  },
  template: await fetch(new URL("./Chat.html", import.meta.url)).then((r) =>
    r.text(),
  ),
  components: {
    ObjectMenu
  }
}
