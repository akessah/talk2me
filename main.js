import {
  createApp,
  defineAsyncComponent,
  computed,
  ref,
  provide,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { createRouter, createWebHashHistory, useRoute } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { getLastRead } from "./components/chatReadState.js";
import { isDirectConversationBetween } from "./components/conversationUtils.js";
import { folderAncestorRecordsForObject } from "./components/folderOperations.js";

const contactDiscoverOpts = {
  properties: {
    value: {
      required: ["username", "handle", "actorId", "published"],
      // required: [],
      properties: {
        username: { type: "string"},
        handle: { type: "string" },
        actorId: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const participantDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "type", "actorId", "published"],
      properties: {
        activity: { enum: ["Add", "Remove"]},
        type: { const: "Participant" },
        actorId: { type: "string" },
        published: { type: "number" },
      },
    },
  },
}

const chatDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "type", "channel", "title", "published"],
      properties: {
        activity: { const: "Create" },
        type: { const: "Chat" },
        channel: { type: "string" },
        title: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const groupDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "type", "channel", "title", "published"],
      properties: {
        activity: { const: "Create" },
        type: { const: "Group" },
        channel: { type: "string" },
        title: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const folderDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "type", "channel", "title", "published"],
      properties: {
        activity: { const: "Create" },
        type: { const: "Folder" },
        channel: { type: "string" },
        title: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const folderUpdateDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "obj", "target", "published"],
      properties: {
        activity: { enum: ["Add", "Remove"] },
        obj: { type: "string" },
        target: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

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

const chatDeletionDiscoverOpts = {
  properties: {
    value: {
      required: ["activity", "chatChannel", "published"],
      properties: {
        activity: { const: "DeleteChat" },
        chatChannel: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const notificationDiscoverOpts = {
  properties: {
    value: {
      required: ["type", "activity", "chatChannel", "messagePublished", "fromActor", "published"],
      properties: {
        type: { const: "Notification" },
        activity: { const: "Message" },
        chatChannel: { type: "string" },
        messagePublished: { type: "number" },
        fromActor: { type: "string" },
        preview: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

const contactNotificationMuteDiscoverOpts = {
  properties: {
    value: {
      required: ["type", "activity", "actorId", "published"],
      properties: {
        type: { const: "ContactNotificationMute" },
        activity: { enum: ["Mute", "Unmute"] },
        actorId: { type: "string" },
        expiresAt: { type: "number" },
        published: { type: "number" },
      },
    },
  },
};

const notificationMuteDiscoverOpts = {
  properties: {
    value: {
      required: ["type", "activity", "targetType", "targetId", "published"],
      properties: {
        type: { const: "NotificationMute" },
        activity: { enum: ["Mute", "Unmute"] },
        targetType: { enum: ["Chat", "Folder"] },
        targetId: { type: "string" },
        expiresAt: { type: "number" },
        published: { type: "number" },
      },
    },
  },
};

function loadComponent(name) {
  return () => import(`./components/${name}/${name}.js`).then((m) => m.default());
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: "/settings", component: loadComponent("settings")},
    {path: "/contacts/:contactId", component: loadComponent("contact"), props: true},
    {path: "/contacts", component: loadComponent("contacts")},
    {path: "/inbox", component: loadComponent("inbox")},
    // Home: optional chat-channel param so every open chat has its own URL.
    // Static routes above take priority over this dynamic segment.
    {path: "/:chatChannel?", component: loadComponent("home")},
  ],
});

createApp({
    setup() {
        const appName = 'Talk2Me';
        const session = useGraffitiSession();
        const graffiti = useGraffiti();
        const route = useRoute();



        const { objects: contacts } = useGraffitiDiscover(
              () => (session.value ? [`${session.value.actor} contacts`] : []),
              // ['my contacts'],
              contactDiscoverOpts,
              session
          );

        const { objects: chats } = useGraffitiDiscover(
            [`${appName} chats`],
            chatDiscoverOpts,
            session,
            true,
        );
        const { objects: groups } = useGraffitiDiscover(
            [`${appName} groups`],
            groupDiscoverOpts,
            session,
            true,
        );
        const { objects: folders } = useGraffitiDiscover(
            () => (session.value ? [`${session.value.actor}/folders`] : []),
            folderDiscoverOpts,
            session
        );

        // Optimistic, in-flight chat creations. We add an entry as soon as
        // the user clicks "Create Chat" so the new chat panel can render
        // (with the correct title) before the actual `graffiti.post` calls
        // resolve. `pendingChatCreations` is the set of channels currently
        // being created -- the chat view uses this to disable Send until
        // the underlying posts complete.
        const pendingChats = ref([]);
        const pendingChatCreations = ref(new Set());

        function startChatCreation(meta) {
            if (!meta?.channel) return;
            const optimistic = {
                url: `pending-chat:${meta.channel}`,
                actor: meta.actor ?? session.value?.actor ?? "",
                value: {
                    activity: "Create",
                    type: "Chat",
                    channel: meta.channel,
                    title: meta.title ?? "",
                    published: meta.published ?? Date.now(),
                },
                allowed: Array.isArray(meta.allowed) ? meta.allowed : [],
                channels: Array.isArray(meta.channels) ? meta.channels : [],
                __pending: true,
            };
            pendingChats.value = [...pendingChats.value, optimistic];
            const next = new Set(pendingChatCreations.value);
            next.add(meta.channel);
            pendingChatCreations.value = next;
        }

        function finishChatCreation(channel) {
            if (!channel) return;
            pendingChats.value = pendingChats.value.filter(
                (c) => c?.value?.channel !== channel,
            );
            const next = new Set(pendingChatCreations.value);
            next.delete(channel);
            pendingChatCreations.value = next;
        }

        provide("startChatCreation", startChatCreation);
        provide("finishChatCreation", finishChatCreation);
        provide("pendingChatCreations", pendingChatCreations);

        const allObjects = computed(() => {
            const realChannels = new Set(
                chats.value.map((c) => c?.value?.channel).filter(Boolean),
            );
            const pendingFiltered = pendingChats.value.filter(
                (p) => !realChannels.has(p?.value?.channel),
            );
            return [
                ...chats.value,
                ...groups.value,
                ...folders.value,
                ...pendingFiltered,
            ];
        });

        // Warm likely-next chats so opening them can reuse prefetched data
        // instead of starting both message + participant discovery cold.
        const prefetchedChatChannels = ref([]);

        function prefetchChatChannel(channel) {
          if (!channel) return;
          prefetchedChatChannels.value = [
            channel,
            ...prefetchedChatChannels.value.filter((ch) => ch !== channel),
          ].slice(0, 8);
        }

        watch(
          () => session.value?.actor,
          () => {
            prefetchedChatChannels.value = [];
          },
        );

        provide("prefetchChatChannel", prefetchChatChannel);

        const { objects: prefetchedMessagesRaw } = useGraffitiDiscover(
          () => prefetchedChatChannels.value,
          messageDiscoverOpts,
          () => session.value,
          true,
        );

        const { objects: prefetchedParticipantUpdatesRaw } = useGraffitiDiscover(
          () => prefetchedChatChannels.value,
          participantDiscoverOpts,
          () => session.value,
          true,
        );

        const prefetchedMessagesByChannel = computed(() => {
          const map = new Map();
          const list = Array.isArray(prefetchedMessagesRaw.value)
            ? prefetchedMessagesRaw.value
            : [];
          for (const message of list) {
            const ch = message?.value?.chatChannel;
            if (!ch) continue;
            if (!map.has(ch)) map.set(ch, []);
            map.get(ch).push(message);
          }
          return map;
        });

        const prefetchedParticipantUpdatesByChannel = computed(() => {
          const map = new Map();
          const list = Array.isArray(prefetchedParticipantUpdatesRaw.value)
            ? prefetchedParticipantUpdatesRaw.value
            : [];
          for (const update of list) {
            const channels = Array.isArray(update?.channels) ? update.channels : [];
            const ch = channels[0] ?? "";
            if (!ch) continue;
            if (!map.has(ch)) map.set(ch, []);
            map.get(ch).push(update);
          }
          return map;
        });

        const { objects: folderUpdates } = useGraffitiDiscover(
              () => (session.value ? [`${session.value.actor}/folders`] : []),
              folderUpdateDiscoverOpts,
              session
        );

        const folderNavStack = ref([]);
        const muteClock = ref(Date.now());
        let muteClockTimer = null;

        onMounted(() => {
          muteClockTimer = window.setInterval(() => {
            muteClock.value = Date.now();
          }, 30000);
        });

        onBeforeUnmount(() => {
          if (muteClockTimer !== null) {
            window.clearInterval(muteClockTimer);
            muteClockTimer = null;
          }
        });

        // The URL is the source of truth for the currently open chat:
        //   /              -> no chat open (params.chatChannel is undefined)
        //   /<chatChannel> -> that chat is open
        // Components still receive `openChatChannel` as a string prop and emit
        // `changeChatChannel` events; we just route through the router below.
        const openChatChannel = computed(() => {
            const raw = route.params?.chatChannel;
            if (Array.isArray(raw)) return raw[0] ?? "";
            return typeof raw === "string" ? raw : "";
        });
        const openChat = computed(() =>
            allObjects.value.find(
                (chat) => chat.value.channel === openChatChannel.value
            )
        );

        const deleting = ref(false);
        async function deleteContacts(){
          deleting.value = true
          for (const contact of contacts.value){
            await graffiti.delete(contact, session.value)
          }
          deleting.value=false
        }

        async function deleteObjects(){
          deleting.value = true
          for (const obj of allObjects.value){
            try{
              await graffiti.delete(obj, session.value)
            }catch(e){
              console.log(e)
              continue
            }

          }
          deleting.value=false
        }

        function changeChatChannel(newChannel){
          const target = newChannel
            ? `/${encodeURIComponent(newChannel)}`
            : "/";
          if (route.fullPath === target) return;
          router.push(target);
        }

        function changeNavStack(newStack){
          folderNavStack.value = newStack;
        }

        function openChatAndGoHome(channel) {
          if (!channel) return;
          folderNavStack.value = [];
          router.push(`/${encodeURIComponent(channel)}`);
        }

        provide("openChatAndGoHome", openChatAndGoHome);

        // Inbox unread count (notification objects + per-chat lastRead in localStorage)
        const lastReadTick = ref(0);
        window.addEventListener("talk2me:lastReadChanged", () => {
          lastReadTick.value++;
        });

        const notificationChannels = computed(() =>
          session.value?.actor ? [`${session.value.actor}/notifications`] : [],
        );
        // IMPORTANT: use the session object (not ref) for discover, to match
        // other components which pass a plain session object.
        const { objects: notifications } = useGraffitiDiscover(
          () => notificationChannels.value,
          notificationDiscoverOpts,
          () => session.value,
          true,
        );

        const { objects: chatDeletions } = useGraffitiDiscover(
          () =>
            session.value?.actor
              ? [`${session.value.actor}/chat-deletions`]
              : [],
          chatDeletionDiscoverOpts,
          () => session.value,
          true,
        );

        const { objects: contactNotificationMutes } = useGraffitiDiscover(
          () =>
            session.value?.actor
              ? [`${session.value.actor}/contact-notification-mutes`]
              : [],
          contactNotificationMuteDiscoverOpts,
          () => session.value,
          true,
        );

        const { objects: notificationMutes } = useGraffitiDiscover(
          () =>
            session.value?.actor
              ? [`${session.value.actor}/notification-mutes`]
              : [],
          notificationMuteDiscoverOpts,
          () => session.value,
          true,
        );

        const mutedContactActors = computed(() => {
          const now = muteClock.value;
          const latestByActor = new Map();
          const list = Array.isArray(contactNotificationMutes.value)
            ? contactNotificationMutes.value
            : [];
          for (const record of list) {
            const actorId = record?.value?.actorId;
            const published = record?.value?.published ?? 0;
            if (!actorId) continue;
            const cur = latestByActor.get(actorId);
            if (!cur || published > (cur?.value?.published ?? 0)) {
              latestByActor.set(actorId, record);
            }
          }
          const muted = new Set();
          for (const [actorId, record] of latestByActor.entries()) {
            if (record?.value?.activity !== "Mute") continue;
            const expiresAt = Number(record?.value?.expiresAt);
            if (Number.isFinite(expiresAt) && expiresAt <= now) continue;
            muted.add(actorId);
          }
          return muted;
        });

        function buildEffectiveMuteRecordMap(records, targetType) {
          const now = muteClock.value;
          const list = Array.isArray(records) ? records : [];
          const sorted = [...list].sort(
            (a, b) => (b?.value?.published ?? 0) - (a?.value?.published ?? 0),
          );
          const resolved = new Map();
          for (const record of sorted) {
            const value = record?.value;
            if (value?.targetType !== targetType) continue;
            const targetId = value?.targetId ?? "";
            if (!targetId || resolved.has(targetId)) continue;
            if (value?.activity === "Mute") {
              const expiresAt = Number(value?.expiresAt);
              if (Number.isFinite(expiresAt) && expiresAt <= now) continue;
            }
            resolved.set(targetId, record);
          }
          return resolved;
        }

        const effectiveChatMuteRecords = computed(() =>
          buildEffectiveMuteRecordMap(notificationMutes.value, "Chat"),
        );

        const effectiveFolderMuteRecords = computed(() =>
          buildEffectiveMuteRecordMap(notificationMutes.value, "Folder"),
        );

        const mutedFolderChannels = computed(() => {
          const muted = new Set();
          for (const [folderChannel, record] of effectiveFolderMuteRecords.value.entries()) {
            if (record?.value?.activity === "Mute") muted.add(folderChannel);
          }
          return muted;
        });

        const mutedChatChannels = computed(() => {
          const muted = new Set();
          const folderRecords = effectiveFolderMuteRecords.value;
          const chatRecords = effectiveChatMuteRecords.value;
          const updates = Array.isArray(folderUpdates.value) ? folderUpdates.value : [];
          const objects = Array.isArray(allObjects.value) ? allObjects.value : [];

          for (const obj of objects) {
            const type = obj?.value?.type;
            const chatChannel = obj?.value?.channel ?? "";
            if (!chatChannel) continue;
            if (type !== "Chat" && type !== "Group") continue;

            let newestAncestorMuteTs = 0;
            for (const folderRecord of folderAncestorRecordsForObject(updates, chatChannel)) {
              const folderChannel = folderRecord?.value?.target ?? "";
              const record = folderRecords.get(folderChannel);
              if (record?.value?.activity !== "Mute") continue;
              const published = Math.max(
                record?.value?.published ?? 0,
                folderRecord?.value?.published ?? 0,
              );
              if (published > newestAncestorMuteTs) newestAncestorMuteTs = published;
            }

            const chatRecord = chatRecords.get(chatChannel);
            if (chatRecord?.value?.activity === "Mute") {
              muted.add(chatChannel);
              continue;
            }

            if (chatRecord?.value?.activity === "Unmute") {
              const chatUnmuteTs = chatRecord?.value?.published ?? 0;
              if (newestAncestorMuteTs > chatUnmuteTs) {
                muted.add(chatChannel);
              }
              continue;
            }

            if (newestAncestorMuteTs > 0) muted.add(chatChannel);
          }

          return muted;
        });

        function isMutedDirectNotification(notif) {
          const chatChannel = notif?.value?.chatChannel;
          if (!chatChannel) return false;
          const sessionActor = session.value?.actor ?? "";
          if (!sessionActor) return false;
          const mutedActors = mutedContactActors.value;
          if (!mutedActors || typeof mutedActors.has !== "function" || !mutedActors.size) {
            return false;
          }
          const conversation = allObjects.value.find(
            (obj) => obj?.value?.channel === chatChannel,
          );
          if (!conversation) return false;
          for (const mutedActor of mutedActors) {
            if (isDirectConversationBetween(conversation, sessionActor, mutedActor)) {
              return true;
            }
          }
          return false;
        }

        function isMutedChatNotification(notif) {
          const chatChannel = notif?.value?.chatChannel;
          if (!chatChannel) return false;
          const mutedChats = mutedChatChannels.value;
          return Boolean(
            mutedChats &&
              typeof mutedChats.has === "function" &&
              mutedChats.has(chatChannel),
          );
        }

        const notificationsForInbox = computed(() => {
          const list = Array.isArray(notifications.value) ? notifications.value : [];
          return list.filter(
            (notif) =>
              !isMutedDirectNotification(notif) && !isMutedChatNotification(notif),
          );
        });

        const chatDeletionCutoffs = computed(() => {
          const m = new Map();
          const list = Array.isArray(chatDeletions.value)
            ? chatDeletions.value
            : [];
          for (const d of list) {
            const ch = d?.value?.chatChannel;
            const ts = d?.value?.published ?? 0;
            if (!ch) continue;
            const cur = m.get(ch) ?? 0;
            if (ts > cur) m.set(ch, ts);
          }
          return m;
        });

        const hiddenChatChannels = computed(() => {
          const hidden = new Set();
          const cuts = chatDeletionCutoffs.value;
          const notifList = Array.isArray(notifications.value)
            ? notifications.value
            : [];

          // Soft-deletion: hide chats whose deletion cutoff has not been
          // overridden by a later notification.
          for (const [ch, cutoff] of cuts) {
            let hasNewer = false;
            for (const n of notifList) {
              if (n?.value?.chatChannel !== ch) continue;
              if ((n?.value?.messagePublished ?? 0) > cutoff) {
                hasNewer = true;
                break;
              }
            }
            if (!hasNewer) hidden.add(ch);
          }

          // Silent: hide chats/groups created by someone else that have not
          // received any message yet (i.e., no notification has ever arrived
          // for that channel). Folders, and chats created by the current
          // user, are unaffected.
          const sessionActor = session.value?.actor;
          const chatsWithNotifs = new Set();
          for (const n of notifList) {
            const ch = n?.value?.chatChannel;
            if (ch) chatsWithNotifs.add(ch);
          }
          for (const obj of allObjects.value) {
            const type = obj?.value?.type;
            if (type !== "Chat" && type !== "Group") continue;
            const ch = obj?.value?.channel;
            if (!ch) continue;
            if (obj.actor && obj.actor === sessionActor) continue;
            if (chatsWithNotifs.has(ch)) continue;
            hidden.add(ch);
          }

          return hidden;
        });

        const inboxUnreadCount = computed(() => {
          void lastReadTick.value;
          const actor = session.value?.actor;
          if (!actor) return 0;
          const list = notificationsForInbox.value;
          const unreadChats = new Set();
          for (const notif of list) {
            const v = notif?.value;
            const ch = v?.chatChannel;
            if (!ch) continue;
            const lr = getLastRead(actor, ch);
            const msgPub = v?.messagePublished ?? 0;
            if (msgPub > lr) unreadChats.add(ch);
          }
          // Dedupe: count unread chats (not individual notification objects).
          return unreadChats.size;
        });

        const inboxBellRinging = ref(false);
        let ringTimeout = null;
        const newestNotificationTs = computed(() => {
          const list = notificationsForInbox.value;
          let best = 0;
          for (const notif of list) {
            const v = notif?.value;
            const ts = v?.published ?? 0;
            if (ts > best) best = ts;
          }
          return best;
        });
        watch(newestNotificationTs, (next, prev) => {
          if (next > prev) {
            inboxBellRinging.value = true;
            if (ringTimeout) clearTimeout(ringTimeout);
            ringTimeout = setTimeout(() => {
              inboxBellRinging.value = false;
            }, 500);
          }
        });

        function updateTabsIndicator() {
          const tabs = document.querySelector(".app-tabs");
          if (!tabs) return;
          const active = tabs.querySelector(".app-tab--active");
          const indicator = tabs.querySelector(".app-tabs__indicator");
          if (!active || !indicator) return;
          const tabsRect = tabs.getBoundingClientRect();
          const a = active.getBoundingClientRect();
          const left = Math.max(0, a.left - tabsRect.left);
          const width = Math.max(0, a.width);
          tabs.style.setProperty("--tabs-indicator-left", `${left}px`);
          tabs.style.setProperty("--tabs-indicator-width", `${width}px`);
        }

        // Keep indicator in sync with route changes + layout changes.
        router.afterEach(async () => {
          await nextTick();
          updateTabsIndicator();
        });
        window.addEventListener("resize", () => updateTabsIndicator());
        nextTick(() => updateTabsIndicator());

        return {
            appName,
            session,
            graffiti,
            contacts,
            allObjects,
            folders,
            folderNavStack,
            openChatChannel,
            openChat,
            deleting,
            folderUpdates,
            chatDeletionCutoffs,
            hiddenChatChannels,
            mutedContactActors,
            mutedChatChannels,
            mutedFolderChannels,
            prefetchedMessagesByChannel,
            prefetchedParticipantUpdatesByChannel,
            inboxUnreadCount,
            inboxBellRinging,
            updateTabsIndicator,
            deleteContacts,
            deleteObjects,
            changeChatChannel,
            changeNavStack,
        };
  },
    template: "#template",
    components: {
        Home: defineAsyncComponent(loadComponent("home")),
        // Settings: defineAsyncComponent(loadComponent("settings")),
        Contact: defineAsyncComponent(loadComponent('contact')),
        Contacts: defineAsyncComponent(loadComponent('contacts'))
    },
})
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .use(router)
  .mount("#app");
