import { toRefs, computed, ref } from "vue";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";
import { sidebarObjectInitials } from "../objectInitials.js";

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
    contacts: { type: Array, default: () => [] },
    hiddenChatChannels: { type: Object, default: () => new Set() },

  },
  setup(props, { emit }) {
    const openingChannel = ref("");
    function titleForChannel(ch) {
        if (!ch) return "";
        const obj = props.allObjects.find((o) => o.value.channel === ch);
        return obj?.value?.title ?? ch;
    }

    const breadcrumbText = computed(() => {
        const stack = Array.isArray(props.folderNavStack) ? props.folderNavStack : [];
        const current = props.sidebarFolderChannel || "";
        const parts = ["Root"];
        for (const ch of stack) {
            if (ch) parts.push(titleForChannel(ch));
        }
        if (current && stack[stack.length - 1] !== current) {
            parts.push(titleForChannel(current));
        }
        return parts.join(" / ");
    });

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
        props.allObjects.filter((obj) => {
            if (!getInFolder.value.includes(obj.value.channel)) return false;
            if (props.hiddenChatChannels && props.hiddenChatChannels.has(obj.value.channel)) return false;
            return true;
        })
    );
    function openObjectFromFolder(obj) {
        emit('changeNavStack', [...props.folderNavStack, props.openChatChannel])
        emit('changeChatChannel', obj.value.channel)
	}

    function openFromFolder(obj) {
        if (obj?.value?.type === "Folder") {
            const ch = obj?.value?.channel ?? "";
            if (!ch) return;
            openingChannel.value = ch;
            window.setTimeout(() => {
                openObjectFromFolder(obj);
                openingChannel.value = "";
            }, 320);
            return;
        }
        openObjectFromFolder(obj);
    }

    function objectInitials(obj) {
        return sidebarObjectInitials(
            obj,
            props.contacts,
            props.session?.actor,
        );
    }

    return {
        openFromFolder,
        openingChannel,
        openFolder,
        sidebarListTitle,
        breadcrumbText,
        objectInitials,
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
