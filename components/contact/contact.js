import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { initialsFromLabel, sidebarObjectInitials } from "../objectInitials.js";
import { currentFolderForObject } from "../folderOperations.js";
import { NOTIFICATION_MUTE_OPTIONS } from "../notificationMuteOptions.js";
import {
    uniqueAllowedActors,
    isConversationSharedWithActors,
} from "../conversationUtils.js";

function setup(props, { emit }) {
    const editUsername = ref(false);
    const showList = ref("chats");
    const usernameBuf = ref("");
    const showMutePopup = ref(false);
    const muteMenuRef = ref(null);

    const contact = computed(() => {
        const allVersions = props.contacts
            .filter((c) => c?.value?.handle === props.contactId)
            .sort((a, b) => (b?.value?.published ?? 0) - (a?.value?.published ?? 0));
        return allVersions[0] ?? null;
    });

    const contactActorId = computed(() => contact.value?.value?.actorId ?? "");

    const contactDisplayName = computed(
        () =>
            contact.value?.value?.username ??
            contact.value?.value?.handle ??
            "Unknown contact",
    );

    const contactHandleText = computed(() => {
        const handle = contact.value?.value?.handle ?? "";
        return handle ? `${handle}.actor.graffiti` : "";
    });

    const contactInitials = computed(() => initialsFromLabel(contactDisplayName.value));
    const muteSubmitting = ref(false);
    const notificationsMuted = computed(() => {
        const set = props.mutedContactActors;
        return Boolean(
            contactActorId.value &&
            set &&
            typeof set.has === "function" &&
            set.has(contactActorId.value),
        );
    });

    function isSharedConversationWithContact(conversation) {
        return (
            isConversationSharedWithActors(conversation, [
                contactActorId.value,
                props.session?.actor ?? "",
            ]) &&
            ["Chat", "Group"].includes(conversation?.value?.type)
        );
    }

    const contactChats = computed(() =>
        props.allObjects.filter(
            (o) =>
                isSharedConversationWithContact(o) &&
                uniqueAllowedActors(o).length === 2,
        ),
    );

    const contactGroups = computed(() =>
        props.allObjects.filter(
            (o) =>
                isSharedConversationWithContact(o) &&
                uniqueAllowedActors(o).length >= 3,
        ),
    );

    const visibleConversations = computed(() =>
        showList.value === "groups" ? contactGroups.value : contactChats.value,
    );

    const objectsInFolder = computed(() => {
        const objs = new Set();
        for (const update of props.folderUpdates || []) {
            if (currentFolderForObject(props.folderUpdates, update.value.obj) !== null) {
                objs.add(update.value.obj);
            }
        }
        return objs;
    });

    function startEditingUsername() {
        usernameBuf.value = contact.value?.value?.username ?? "";
        editUsername.value = true;
    }

    async function changeUsername() {
        if (!contactActorId.value) return;

        await props.graffiti.post(
            {
                value: {
                    actorId: contactActorId.value,
                    username: usernameBuf.value.trim() || contact.value?.value?.handle || "",
                    handle: props.contactId,
                    published: Date.now(),
                },
                allowed: [],
                channels: [`${props.session.actor} contacts`],
            },
            props.session,
        );

        editUsername.value = false;
    }

    function openObjectFromRoot(obj) {
        emit("changeNavStack", []);
        emit("changeChatChannel", obj.value.channel);
    }

    function openObjectFromFolder(obj) {
        emit("changeNavStack", [...props.folderNavStack, props.openChatChannel]);
        emit("changeChatChannel", obj.value.channel);
    }

    function openConversation(conversation) {
        const channel = conversation?.value?.channel;
        if (!channel) return;
        if (objectsInFolder.value.has(channel)) {
            openObjectFromFolder(conversation);
        } else {
            openObjectFromRoot(conversation);
        }
    }

    function conversationInitials(conversation) {
        return sidebarObjectInitials(
            conversation,
            props.contacts,
            props.session?.actor,
        );
    }

    async function createChat() {
        if (!contactActorId.value) return;

        const newChatChannel = crypto.randomUUID();
        const published = Date.now();
        const recipientActors = Array.from(
            new Set([contactActorId.value].filter(
                (actor) => actor && actor !== props.session.actor,
            )),
        );

        emit("changeChatChannel", newChatChannel);
        emit("changeNavStack", []);

        await props.graffiti.post(
            {
                value: {
                    activity: "Create",
                    type: "Chat",
                    channel: newChatChannel,
                    title: contactDisplayName.value,
                    published,
                },
                allowed: recipientActors,
                channels: [
                    `${props.appName} chats`,
                    `${props.session.actor}/chats`,
                ],
            },
            props.session,
        );

        await props.graffiti.post(
            {
                value: {
                    activity: "Add",
                    type: "Participant",
                    actorId: contactActorId.value,
                    published: Date.now(),
                },
                allowed: recipientActors,
                channels: [newChatChannel],
            },
            props.session,
        );
    }

    function toggleMutePopup() {
        if (!contactActorId.value || muteSubmitting.value) return;
        showMutePopup.value = !showMutePopup.value;
    }

    async function muteFor(durationMs) {
        if (!contactActorId.value || muteSubmitting.value) return;
        muteSubmitting.value = true;
        try {
            const published = Date.now();
            await props.graffiti.post(
                {
                    value: {
                        type: "ContactNotificationMute",
                        activity: "Mute",
                        actorId: contactActorId.value,
                        expiresAt: published + durationMs,
                        published,
                    },
                    allowed: [],
                    channels: [`${props.session.actor}/contact-notification-mutes`],
                },
                props.session,
            );
            showMutePopup.value = false;
        } finally {
            muteSubmitting.value = false;
        }
    }

    async function unmuteNotifications() {
        if (!contactActorId.value || muteSubmitting.value) return;
        muteSubmitting.value = true;
        try {
            await props.graffiti.post(
                {
                    value: {
                        type: "ContactNotificationMute",
                        activity: "Unmute",
                        actorId: contactActorId.value,
                        published: Date.now(),
                    },
                    allowed: [],
                    channels: [`${props.session.actor}/contact-notification-mutes`],
                },
                props.session,
            );
            showMutePopup.value = false;
        } finally {
            muteSubmitting.value = false;
        }
    }

    function handleDocumentPointerDown(event) {
        if (!showMutePopup.value) return;
        const el = muteMenuRef.value;
        if (el && !el.contains(event.target)) {
            showMutePopup.value = false;
        }
    }

    function handleDocumentKeydown(event) {
        if (event.key === "Escape") {
            showMutePopup.value = false;
        }
    }

    onMounted(() => {
        document.addEventListener("pointerdown", handleDocumentPointerDown);
        document.addEventListener("keydown", handleDocumentKeydown);
    });

    onBeforeUnmount(() => {
        document.removeEventListener("pointerdown", handleDocumentPointerDown);
        document.removeEventListener("keydown", handleDocumentKeydown);
    });

    return {
        muteOptions: NOTIFICATION_MUTE_OPTIONS,
        editUsername,
        showList,
        usernameBuf,
        showMutePopup,
        muteMenuRef,
        contact,
        contactDisplayName,
        contactHandleText,
        contactInitials,
        notificationsMuted,
        muteSubmitting,
        changeUsername,
        startEditingUsername,
        contactChats,
        contactGroups,
        visibleConversations,
        openConversation,
        conversationInitials,
        createChat,
        toggleMutePopup,
        muteFor,
        unmuteNotifications,
    };
}




export default async () => ({
  props: ['graffiti', 'session', 'contactId', 'contacts', 'allObjects', 'folders', 'folderNavStack', 'openChatChannel', 'folderUpdates', 'appName', 'mutedContactActors'],
  emits: ['changeChatChannel', 'changeNavStack'],
  setup,
  template: await fetch(new URL("./contact.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
