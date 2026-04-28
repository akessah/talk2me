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


function setup(props) {
	const { objects: chats } = useGraffitiDiscover(
		[`${props.appName} chats`],
		chatDiscoverOpts,
		props.session
	);
	const { objects: groups } = useGraffitiDiscover(
		[`${props.appName} groups`],
		groupDiscoverOpts,
		props.session
	);
	const { objects: folders } = useGraffitiDiscover(
		() => (props.session ? [`${props.session.actor}/folders`] : []),
		folderDiscoverOpts,
		props.session
	);

	const allObjects = computed(() => [
		...chats.value,
		...groups.value,
		...folders.value,
	]);

	const { objects: folderUpdates } = useGraffitiDiscover(
		() => (props.session ? [`${props.session.actor}/folders`] : []),
		folderUpdateDiscoverOpts,
		props.session
	);




	const newObject = ref(false);
	const folderNavStack = ref([]);
	const openChatChannel = ref("");
	const openChat = computed(() =>
        allObjects.value.find(
          (chat) => chat.value.channel === openChatChannel.value
        )
    );

	function folderBack() {
		const s = folderNavStack.value;
		if (s.length === 0) {
			openChatChannel.value = "";
			return;
		}
		const parent = s[s.length - 1];
		folderNavStack.value = s.slice(0, -1);
		openChatChannel.value = parent;
	}

	function openObjectFromRoot(obj) {
		folderNavStack.value = [];
		openChatChannel.value = obj.value.channel;
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
        const ch = openChatChannel.value;
        if (!ch) return null;
        const obj = openChat.value;
        if (!obj?.value) return null;
        if (obj.value.type === "Folder") return ch;
        if (obj.value.type === "Chat" || obj.value.type === "Group") {
          return currentFolderForObject(folderUpdates.value, ch);
        }
        return null;
    });

	const toggleNew = () => newObject.value = !newObject.value




	return {
		newObject,
		openChatChannel,
		openChat,
		folderNavStack,
		folderBack,
		openObjectFromRoot,
		allObjects,
		folders,
		folderUpdates,
		sidebarFolderChannel,
		toggleNew
	};
}




export default async () => ({
  props: ['graffiti', 'session', 'appName'],
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
