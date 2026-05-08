import { computed, inject } from "vue";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { getLastRead } from "../chatReadState.js";
import { initialsFromLabel } from "../objectInitials.js";

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

export default async () => ({
  props: {
    session: { type: Object, required: true },
    appName: { type: String, required: true },
    allObjects: { type: Array, default: () => [] },
    contacts: { type: Array, default: () => [] },
  },
  setup(props) {
    const openChatAndGoHome = inject("openChatAndGoHome", null);

    const { objects: notificationsRaw } = useGraffitiDiscover(
      () =>
        props.session?.actor
          ? [`${props.session.actor}/notifications`]
          : [],
      notificationDiscoverOpts,
      props.session,
      true,
    );

    function contactActorId(c) {
      const v = c?.value;
      return v?.actorId ?? v?.actor ?? "";
    }

    function latestContactForActor(actor) {
      const list = Array.isArray(props.contacts) ? props.contacts : [];
      let best = null;
      for (const c of list) {
        if (contactActorId(c) !== actor) continue;
        if (!best || (c?.value?.published ?? 0) > (best?.value?.published ?? 0)) {
          best = c;
        }
      }
      return best;
    }

    function senderLabel(actor) {
      const c = latestContactForActor(actor);
      const username = c?.value?.username ?? "";
      const handle = c?.value?.handle ?? "";
      return (username || handle || "").trim();
    }

    function chatTitle(channel) {
      const o = props.allObjects?.find((x) => x?.value?.channel === channel);
      return o?.value?.title ?? "Chat";
    }

    function formatWhen(published) {
      const ts = Number(published);
      if (!Number.isFinite(ts)) return "";
      return new Date(ts).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const notifications = computed(() => {
      const actor = props.session?.actor;
      if (!actor) return [];
      const raw = notificationsRaw?.value;
      const list = Array.isArray(raw) ? raw : [];
      // Dedupe: show one row per chatChannel (newest unread notification wins).
      const bestByChat = new Map();
      const unreadCountByChat = new Map();
      for (const notif of list) {
        const v = notif?.value;
        const ch = v?.chatChannel;
        if (!ch) continue;
        const lr = getLastRead(actor, ch);
        const msgPub = v.messagePublished ?? 0;
        if (msgPub <= lr) continue;

        unreadCountByChat.set(ch, (unreadCountByChat.get(ch) ?? 0) + 1);

        const cur = bestByChat.get(ch);
        const curPub = cur?.v?.messagePublished ?? 0;
        if (!cur || msgPub > curPub) {
          bestByChat.set(ch, { notif, v });
        }
      }

      const rows = Array.from(bestByChat.entries()).map(([ch, { notif, v }]) => {
        const pub = v.messagePublished ?? 0;
        return {
          key: `${ch}-${pub}-${notif?.url ?? ""}`,
          chatChannel: ch,
          preview: (v.preview ?? "").trim() || "(no text)",
          published: pub,
          when: formatWhen(pub),
          senderActor: v.fromActor,
          sender: senderLabel(v.fromActor),
          title: chatTitle(ch),
          unreadCount: unreadCountByChat.get(ch) ?? 1,
        };
      });

      rows.sort((a, b) => (b.published ?? 0) - (a.published ?? 0));
      return rows;
    });

    function onOpen(n) {
      if (typeof openChatAndGoHome === "function") {
        openChatAndGoHome(n.chatChannel);
      }
    }

    function chatInitials(n) {
      return initialsFromLabel(n?.title ?? "");
    }

    return {
      notifications,
      onOpen,
      chatInitials,
    };
  },
  template: await fetch(new URL("./inbox.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
