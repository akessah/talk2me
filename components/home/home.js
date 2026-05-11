import { createApp, ref, computed } from "vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import RootSidebar from "../RootSidebar/RootSidebar.js";
import NewObjectSidebar from "../NewObjectSidebar/NewObjectSidebar.js";
import Chat from "../chat/Chat.js";
import FolderSidebar from "../FolderSidebar/FolderSidebar.js"



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




function setup(props, { emit }) {
	// const { objects: chats } = useGraffitiDiscover(
  //     [`${props.appName} chats`],
  //     chatDiscoverOpts,
  //     props.session
	// );
	// const { objects: groups } = useGraffitiDiscover(
  //     [`${props.appName} groups`],
  //     groupDiscoverOpts,
  //     props.session
	// );
	// const { objects: folders } = useGraffitiDiscover(
  //     () => (props.session ? [`${props.session.actor}/folders`] : []),
  //     folderDiscoverOpts,
  //     props.session
	// );

	// const allObjects = computed(() => [
  //     ...chats.value,
  //     ...groups.value,
  //     ...folders.value,
	// ]);


	// const { objects: folderUpdates } = useGraffitiDiscover(
  //     () => (props.session ? [`${props.session.actor}/folders`] : []),
  //     folderUpdateDiscoverOpts,
  //     props.session
	// );




	const newObject = ref(false);
	// const folderNavStack = ref([]);
	// const openChatChannel = ref("");
	// const openChat = computed(() =>
  //     props.allObjects.find(
  //         (chat) => chat.value.channel === openChatChannel.value
  //     )
  // );

	function folderBack() {
      const s = props.folderNavStack;
      if (s.length === 0) {
          // props.openChatChannel = "";
          emit('changeChatChannel', "");
          return;
      }
      const parent = s[s.length - 1];
      // props.folderNavStack = s.slice(0, -1);
      emit('changeNavStack', s.slice(0, -1));
      emit('changeChatChannel', parent);
      // props.openChatChannel = parent;
	}

	function openObjectFromRoot(obj) {
      // props.folderNavStack = [];
      emit('changeNavStack', []);
      emit('changeChatChannel', obj.value.channel);
      // props.openChatChannel = obj.value.channel;
	}


	function latestFolderUpdatesByPair(updates) {
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
    function currentFolderForObject(updates, objectChannel) {
        const byPair = latestFolderUpdatesByPair(updates);
        let best = null;
        for (const u of byPair.values()) {
            if (u.value.obj !== objectChannel || u.value.activity !== "Add") continue;
            if (!best || u.value.published > best.value.published) {
                best = u;
            }
        }
        return best ? best.value.target : null;
    }

    const sidebarFolderChannel = computed(() => {
        const ch = props.openChatChannel;
        if (!ch) return null;
        const obj = props.openChat;
        if (!obj?.value) return null;
        if (obj.value.type === "Folder") return ch;
        if (obj.value.type === "Chat" || obj.value.type === "Group") {
            return currentFolderForObject(props.folderUpdates, ch);
        }
        return null;
    });

	const toggleNew = () => newObject.value = !newObject.value;

	// A chat is "open" (covers the screen on mobile) only when the open
	// object is an actual chat or group. Folders are treated as sidebar
	// navigation, not a chat that should hide the sidebar on mobile.
	const hasOpenChat = computed(() => {
		const type = props.openChat?.value?.type;
		return type === "Chat" || type === "Group";
	});

  const objectsInFolder = computed(()=>{
      const objs = new Set()
      for (const update of props.folderUpdates){
          if (currentFolderForObject(props.folderUpdates, update.value.obj) !== null)
              objs.add(update.value.obj)
      }
      return objs
  })


  const root = computed(()=>{
      return props.allObjects.filter(o => {
          if (objectsInFolder.value.has(o.value.channel)) return false;
          if (props.hiddenChatChannels && props.hiddenChatChannels.has(o.value.channel)) return false;
          return true;
      });
  })




	return {
		newObject,
		// openChatChannel,
		// openChat,
		// folderNavStack,
		folderBack,
		openObjectFromRoot,
		// folderUpdates,
		sidebarFolderChannel,
		toggleNew,
		hasOpenChat,
		root
	};
}




export default async () => ({
  props: ['graffiti', 'session', 'appName', 'contacts', 'allObjects', 'folders', 'folderNavStack', 'openChat', 'openChatChannel', 'folderUpdates', 'chatDeletionCutoffs', 'hiddenChatChannels', 'mutedChatChannels', 'mutedFolderChannels', 'prefetchedMessagesByChannel', 'prefetchedParticipantUpdatesByChannel'],
  emits: ['changeChatChannel', 'changeNavStack'],
  setup,
  template: await fetch(new URL("./home.html", import.meta.url)).then((r) =>
    r.text(),
  ),
  components: {
    RootSidebar,
    NewObjectSidebar,
	  Chat,
	  FolderSidebar
  }
});
