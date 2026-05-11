import { toRefs, computed, ref, watch, inject } from "vue";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";
import { sidebarObjectInitials } from "../objectInitials.js";
import {
  addObjectExclusiveToFolder,
  currentFolderForObject,
  isFolderDescendantOf,
} from "../folderOperations.js";

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
    mutedChatChannels: { type: Object, default: () => new Set() },
    mutedFolderChannels: { type: Object, default: () => new Set() },

  },
  setup(props, { emit }) {
    const openingChannel = ref("");
    const draggingChannel = ref("");
    const dragOverFolderChannel = ref("");
    const movingObjectChannel = ref("");
    const movingTargetFolderChannel = ref("");
    const prefetchChatChannel = inject("prefetchChatChannel", null);
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

    function maybePrefetchObject(obj) {
        const type = obj?.value?.type;
        const channel = obj?.value?.channel ?? "";
        if (!channel) return;
        if (type !== "Chat" && type !== "Group") return;
        if (typeof prefetchChatChannel === "function") {
            prefetchChatChannel(channel);
        }
    }

    function objectForChannel(channel) {
        if (!channel) return null;
        const list = Array.isArray(props.allObjects) ? props.allObjects : [];
        return list.find((obj) => obj?.value?.channel === channel) ?? null;
    }

    function canDropObjectOnFolder(sourceChannel, targetFolderChannel) {
        if (!sourceChannel || !targetFolderChannel) return false;
        if (sourceChannel === targetFolderChannel) return false;
        const sourceObj = objectForChannel(sourceChannel);
        const targetObj = objectForChannel(targetFolderChannel);
        if (!sourceObj?.value || targetObj?.value?.type !== "Folder") return false;

        const updates = Array.isArray(props.folderUpdates) ? props.folderUpdates : [];
        if (currentFolderForObject(updates, sourceChannel) === targetFolderChannel) {
            return false;
        }
        if (
            sourceObj.value.type === "Folder" &&
            isFolderDescendantOf(updates, targetFolderChannel, sourceChannel)
        ) {
            return false;
        }

        return true;
    }

    function onDragStart(event, obj) {
        const channel = obj?.value?.channel ?? "";
        if (!channel || !event.dataTransfer) return;
        draggingChannel.value = channel;
        dragOverFolderChannel.value = "";
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", channel);
    }

    function onDragEnd() {
        draggingChannel.value = "";
        dragOverFolderChannel.value = "";
    }

    watch(
        () => props.folderUpdates,
        (updates) => {
            if (!movingObjectChannel.value || !movingTargetFolderChannel.value) return;
            const current = currentFolderForObject(
                Array.isArray(updates) ? updates : [],
                movingObjectChannel.value,
            );
            if (current === movingTargetFolderChannel.value) {
                movingObjectChannel.value = "";
                movingTargetFolderChannel.value = "";
            }
        },
        { deep: true },
    );

    function onFolderDragOver(event, targetObj) {
        const targetFolderChannel = targetObj?.value?.channel ?? "";
        const sourceChannel =
            draggingChannel.value || event.dataTransfer?.getData("text/plain") || "";
        if (!canDropObjectOnFolder(sourceChannel, targetFolderChannel)) {
            dragOverFolderChannel.value = "";
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        dragOverFolderChannel.value = targetFolderChannel;
    }

    function onFolderDragLeave(event, targetObj) {
        const targetFolderChannel = targetObj?.value?.channel ?? "";
        const related = event.relatedTarget;
        if (
            related &&
            event.currentTarget instanceof Element &&
            event.currentTarget.contains(related)
        ) {
            return;
        }
        if (dragOverFolderChannel.value === targetFolderChannel) {
            dragOverFolderChannel.value = "";
        }
    }

    async function onFolderDrop(event, targetObj) {
        const targetFolderChannel = targetObj?.value?.channel ?? "";
        const sourceChannel =
            draggingChannel.value || event.dataTransfer?.getData("text/plain") || "";
        dragOverFolderChannel.value = "";
        if (!canDropObjectOnFolder(sourceChannel, targetFolderChannel)) {
            draggingChannel.value = "";
            return;
        }
        event.preventDefault();
        movingObjectChannel.value = sourceChannel;
        movingTargetFolderChannel.value = targetFolderChannel;
        try {
            await addObjectExclusiveToFolder({
                graffiti: props.graffiti,
                session: props.session,
                objectChannel: sourceChannel,
                targetFolderChannel,
                folderUpdates: props.folderUpdates,
            });
        } catch (e) {
            console.error(e);
            movingObjectChannel.value = "";
            movingTargetFolderChannel.value = "";
        } finally {
            draggingChannel.value = "";
        }
    }

    watch(
        openFolder,
        (objects) => {
            for (const obj of (objects || []).slice(0, 6)) {
                maybePrefetchObject(obj);
            }
        },
        { immediate: true },
    );

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
        draggingChannel,
        dragOverFolderChannel,
        movingObjectChannel,
        maybePrefetchObject,
        onDragStart,
        onDragEnd,
        onFolderDragOver,
        onFolderDragLeave,
        onFolderDrop,
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
