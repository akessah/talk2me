import { ref, toRefs, computed, watch, onUnmounted, nextTick } from "vue";
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
  },
  setup(props) {
    const { objects: messages } = useGraffitiDiscover(
        () => [props.openChatChannel],
        messageDiscoverOpts,
        props.session
    );

    const { objects: participantUpdates } = useGraffitiDiscover(
      () => [props.openChatChannel],
      participantDiscoverOpts,
      props.session,
    );

    // const openChat = computed(() =>
    //     props.allObjects.find(
    //       (chat) => chat.value.channel === props.openChatChannel
    //     )
    // );

    const newMessage = ref("");
    const participantsDetailsRef = ref(null);
    const messageThreadRef = ref(null);
    const userPinnedToBottom = ref(true);
    const optimisticMessages = ref([]);

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

    const participants = computed(() => {
      if (!hasOpenChat.value) return [];
      const sessionActor = props.session?.actor ?? "";
      const updates = Array.isArray(participantUpdates?.value)
        ? participantUpdates.value
        : Array.isArray(participantUpdates)
          ? participantUpdates
          : [];

      // Reduce to latest Add/Remove per actorId, then keep the ones currently "Add".
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

      const activeActors = [];
      for (const [actorId, u] of latestByActor.entries()) {
        if (u?.value?.activity === "Add") activeActors.push(actorId);
      }

      // Always include self so the list doesn't look empty.
      const unique = new Set([sessionActor, ...activeActors].filter(Boolean));
      // console.log(unique)
      return Array.from(unique).map((actor) => {
        const c = latestContactForActor(actor);
        // console.log(c)
        const username = c?.value?.username ?? "";
        const handle = c?.value?.handle ?? "";
        // If we have a saved contact, prefer showing the contact's username.
        const label = c ? (username || handle || "") : (handle || username || "");
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
      let suggested = "";
      try {
        if (typeof props.graffiti.actorToHandle === "function") {
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
      const list = Array.isArray(raw) ? raw : [];
      const opts = Array.isArray(optimisticMessages.value)
        ? optimisticMessages.value
        : [];

      const filteredOpts = opts.filter((m) => !hasRealMessageForOptimistic(m));
      const combined = [...list, ...filteredOpts];
      combined.sort((a, b) => (a?.value?.published ?? 0) - (b?.value?.published ?? 0));
      return combined;
    });

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
      return c?.value?.username ?? "";
    }

    function formatMessageTime(published) {
      const ts = Number(published);
      if (!Number.isFinite(ts)) return "";
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    async function sendMessage(message) {
      const content = String(message ?? "").trim();
      if (!content || !props.openChatChannel) return;

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
      newMessage.value = "";
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
      messages,
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
      },
    );

    watch(hasOpenChat, (open) => {
      if (!open) {
        newMessage.value = "";
        expandedMessageKeys.value = new Set();
        closeParticipants();
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
      participants,
      promptCreateContactForActor,
      isMessageExpanded,
      toggleMessageExpanded,
      messageDisplayName,
      formatMessageTime,
      participantsDetailsRef,
      onParticipantsToggle,
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
