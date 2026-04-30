import { ref, toRefs, computed } from "vue";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";

export default {
  props: {
    openChat: { type: Object, default: undefined },
    openChatChannel: { type: String, default: ""},
    allObjects: { type: Array, required: true},
    folderNavStack: { type: Array, required: true},
    folderUpdates: { type: Array, required: true },
    sidebarFolderChannel: { type: String, default: ""},
    folderBack: { type: Function, required: true},
    folders: { type: Array, required: true},
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },

  },
  setup(props, { emit }) {
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

    // const sidebarFolderChannel = computed(() => {
    //     const ch = props.openChatChannel;
    //     if (!ch) return null;
    //     const obj = props.openChat;
    //     if (!obj?.value) return null;
    //     if (obj.value.type === "Folder") return ch;
    //     if (obj.value.type === "Chat" || obj.value.type === "Group") {
    //       return currentFolderForObject(props.folderUpdates, ch);
    //     }
    //     return null;
    // });

    const sidebarFolderObject = computed(() => {
        const fc = props.sidebarFolderChannel;
        if (!fc) return undefined;
            return props.allObjects.find((o) => o.value.channel === fc);
    });

    const sidebarListTitle = computed(
        () => sidebarFolderObject.value?.value?.title ?? ""
    );

    const getInFolder = computed(() => {
        const folder = props.sidebarFolderChannel;
        if (!folder) return [];
        const updates = props.folderUpdates;
        return props.allObjects
          .map((o) => o.value.channel)
          .filter((ch) => currentFolderForObject(updates, ch) === folder);
    });

    const openFolder = computed(() =>
        props.allObjects.filter((obj) =>
            getInFolder.value.includes(obj.value.channel)
        )
    );
    function openObjectFromFolder(obj) {
        emit('changeNavStack', [...props.folderNavStack, props.openChatChannel])
		// props.folderNavStack = [...props.folderNavStack, props.openChatChannel];
        emit('changeChatChannel', obj.value.channel)
		// props.openChatChannel = obj.value.channel;
	}
    return {
        openObjectFromFolder,
        openFolder,
        sidebarListTitle,
        ...toRefs(props),
    };
  },
  template: await fetch(new URL("./FolderSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  ),
  components: {
    ObjectMenu
  },
  emits: ['changeChatChannel', 'changeNavStack'],
}
