import { createApp, defineAsyncComponent, computed, ref, provide, watch, nextTick } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { getLastRead } from "./components/chatReadState.js";

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

function loadComponent(name) {
  console.log('loaded')
  return () => import(`./components/${name}/${name}.js`).then((m) => m.default());
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: "/", component: loadComponent("home")},
    // {path: "/chat/:chatId", component: loadComponent("chat"), props: true},
    {path: "/settings", component: loadComponent("settings")},
    {path: "/contacts/:contactId", component: loadComponent("contact"), props: true},
    {path: "/contacts", component: loadComponent("contacts")},
    {path: "/inbox", component: loadComponent("inbox")},
  ],
});

createApp({
    setup() {
        const appName = 'Talk2Me';
        const session = useGraffitiSession();
        const graffiti = useGraffiti();



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

        const allObjects = computed(() => [
            ...chats.value,
            ...groups.value,
            ...folders.value,
        ]);

        const { objects: folderUpdates } = useGraffitiDiscover(
              () => (session.value ? [`${session.value.actor}/folders`] : []),
              folderUpdateDiscoverOpts,
              session
        );

        const folderNavStack = ref([]);
        const openChatChannel = ref("");
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
          openChatChannel.value = newChannel
        }

        function changeNavStack(newStack){
          folderNavStack.value = newStack;
        }

        function openChatAndGoHome(channel) {
          if (!channel) return;
          folderNavStack.value = [];
          openChatChannel.value = channel;
          router.push("/");
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
          const list = Array.isArray(notifications.value)
            ? notifications.value
            : [];
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
          const list = Array.isArray(notifications.value)
            ? notifications.value
            : [];
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
