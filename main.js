import { createApp, defineAsyncComponent, computed, ref } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

const contactDiscoverOpts = {
  properties: {
    value: {
      required: ["username", "handle", "actor", "published"],
      // required: [],
      properties: {
        username: { type: "string"},
        handle: { type: "string" },
        actor: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

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
            session
        );
        const { objects: groups } = useGraffitiDiscover(
            [`${appName} groups`],
            groupDiscoverOpts,
            session
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
            await graffiti.delete(obj, session.value)
          }
          deleting.value=false
        }

        function changeChatChannel(newChannel){
          openChatChannel.value = newChannel
        }

        function changeNavStack(newStack){
          folderNavStack.value = newStack;
        }


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
            deleteContacts,
            deleteObjects,
            changeChatChannel,
            changeNavStack
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
