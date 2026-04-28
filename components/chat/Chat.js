import { ref, toRefs, computed } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import ObjectMenu from "../ObjectMenu/ObjectMenu.js";

const messageDiscoverOpts = {
  properties: {
    value: {
      required: ["content", "published"],
      properties: {
        content: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

export default {
  props: {
    // messages: { type: Object, required: true },
    folders: { type: Object, required: true },
    folderUpdates: { type: [Array, Object], default: () => [] },
    allObjects: { type: Array, default: () => [] },
    // openChat: { type: Object, default: undefined },
    openChatChannel: { type: String, default: "" },
    openChat: { type: Object, default: undefined },
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },
    appName: { type: String, required: true },
    folderNavStack: { type: Array, required: true},
    folderBack: { type: Function, required: true},
  },
  setup(props) {
    const { objects: messages } = useGraffitiDiscover(
        () => [props.openChatChannel],
        messageDiscoverOpts,
        props.session
    );

    // const openChat = computed(() =>
    //     props.allObjects.find(
    //       (chat) => chat.value.channel === props.openChatChannel
    //     )
    // );

    const newMessage = ref("");

    function isOwnMessage(message) {
      return (
        props.session?.actor != null &&
        message.actor === props.session.actor
      );
    }

    async function sendMessage(message) {
      await props.graffiti.post(
        {
          value: {
            content: message,
            published: Date.now(),
          },
          channels: [props.openChatChannel, `${props.appName} messages`],
        },
        props.session
      );
    }

    return {
      ...toRefs(props),
      messages,
      sendMessage,
      newMessage,
      isOwnMessage,
    //   openChat,
    //   folderNavStack,
    //   folderBack,
    };
  },
  template: await fetch(new URL("./Chat.html", import.meta.url)).then((r) =>
    r.text(),
  ),
  components: {
    ObjectMenu
  }
}
