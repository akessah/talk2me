import { toRefs, ref } from "vue";
import { sidebarObjectInitials } from "../objectInitials.js";

export default {
  props: {
    allObjects: { type: Array, required: true },
    openChatChannel: { type: String, default: "" },
    openObjectFromRoot: { type: Function, required: true },
    contacts: { type: Array, default: () => [] },
    session: { type: Object, required: true },
  },
  setup(props) {
    const openingChannel = ref("");

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

    return {
      objectInitials,
      openFromRoot,
      openingChannel,
      ...toRefs(props),
    };
  },
  template: await fetch(new URL("./RootSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
