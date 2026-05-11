import { toRefs, ref, watch, inject } from "vue";
import { sidebarObjectInitials } from "../objectInitials.js";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";
import {
  addObjectExclusiveToFolder,
  currentFolderForObject,
  isFolderDescendantOf,
} from "../folderOperations.js";

export default {
  props: {
    allObjects: { type: Array, required: true },
    menuObjects: { type: Array, required: true },
    openChatChannel: { type: String, default: "" },
    openObjectFromRoot: { type: Function, required: true },
    contacts: { type: Array, default: () => [] },
    session: { type: Object, required: true },
    folders: { type: Array, required: true },
    folderUpdates: { type: Array, required: true },
    graffiti: { type: Object, required: true },
    folderNavStack: { type: Array, required: true },
    folderBack: { type: Function, required: true },
    mutedChatChannels: { type: Object, default: () => new Set() },
    mutedFolderChannels: { type: Object, default: () => new Set() },
  },
  setup(props) {
    const openingChannel = ref("");
    const draggingChannel = ref("");
    const dragOverFolderChannel = ref("");
    const movingObjectChannel = ref("");
    const movingTargetFolderChannel = ref("");
    const prefetchChatChannel = inject("prefetchChatChannel", null);

    function objectInitials(obj) {
      return sidebarObjectInitials(
        obj,
        props.contacts,
        props.session?.actor,
      );
    }

    function openFromRoot(obj) {
      if (obj?.value?.type === "Folder") {
        const ch = obj?.value?.channel ?? "";
        if (!ch) return;
        openingChannel.value = ch;
        window.setTimeout(() => {
          props.openObjectFromRoot(obj);
          openingChannel.value = "";
        }, 320);
        return;
      }
      props.openObjectFromRoot(obj);
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
      const list = Array.isArray(props.menuObjects) ? props.menuObjects : [];
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
      () => props.allObjects,
      (objects) => {
        for (const obj of (objects || []).slice(0, 6)) {
          maybePrefetchObject(obj);
        }
      },
      { immediate: true },
    );

    return {
      objectInitials,
      openFromRoot,
      maybePrefetchObject,
      openingChannel,
      draggingChannel,
      dragOverFolderChannel,
      movingObjectChannel,
      onDragStart,
      onDragEnd,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDrop,
      ...toRefs(props),
    };
  },
  template: await fetch(new URL("./RootSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  ),
  components: {
    ObjectMenu,
  },
}
