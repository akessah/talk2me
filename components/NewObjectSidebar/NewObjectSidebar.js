import { ref, toRefs, nextTick, watch, inject } from "vue";
import { useRouter } from "vue-router";

export default {
  props: {
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },
    appName: { type: String, required: true },
    toggleNew: { type: Function, required: true },
    contacts: { type: Array, required: true },
    /** When set, new chats/folders are added to this folder (folder channel id). */
    sidebarFolderChannel: { type: [String, null], default: null },
  },
  setup(props) {
    const router = useRouter();
    const startChatCreation = inject("startChatCreation", () => {});
    const finishChatCreation = inject("finishChatCreation", () => {});

    const newChatName = ref("");
    const otherHandle = ref("");
    const chatParticipants = ref([]);
    const newGroupName = ref("");
    const otherHandles = ref("");
    const newFolderName = ref("");
    const handleError = ref(false);
    const handleErrorMessage = ref("This graffiti handle was not found. Please try again.");
    const shakeHandleInput = ref(false);
    const submitting = ref(false);

    const HANDLE_SHAKE_MS = 450;

    function clearHandleShakeAnimation() {
      shakeHandleInput.value = false;
    }

    async function triggerHandleShake() {
      shakeHandleInput.value = false;
      await nextTick();
      shakeHandleInput.value = true;
      setTimeout(clearHandleShakeAnimation, HANDLE_SHAKE_MS);
    }

    watch(otherHandle, () => {
      handleError.value = false;
      handleErrorMessage.value = "This graffiti handle was not found. Please try again.";
    });
    // let graffitiActor = useGraffitiHandleToActor(
    //       `googoo.graffiti.actor`
    //     ).actor;

    function splitHandles(handles) {
      return handles.split(",").map((handle) => handle.trim());
    }

    async function addObjectToOpenFolder(objectChannel, published) {
      const target = props.sidebarFolderChannel;
      if (target == null || target === "") return;
      await props.graffiti.post(
        {
          value: {
            activity: "Add",
            obj: objectChannel,
            target,
            published,
          },
          allowed: [],
          channels: [`${props.session.actor}/folders`],
        },
        props.session,
      );
    }

    function findContactByUsername(query) {
      if (!query) return null;
      const matches = props.contacts
        .filter((c) => c?.value?.username === query)
        .sort((a, b) => (b.value.published ?? 0) - (a.value.published ?? 0));
      return matches.length > 0 ? matches[0] : null;
    }

    function contactActorId(contact) {
      const v = contact?.value;
      return v?.actorId ?? v?.actor ?? "";
    }

    async function resolveChatParticipant(query) {
      const trimmed = query.trim();
      if (!trimmed) return null;

      const contactMatch = findContactByUsername(trimmed);
      if (contactMatch) {
        const actor = contactActorId(contactMatch);
        if (!actor) return null;
        return {
          actor,
          label: contactMatch.value.username || contactMatch.value.handle || trimmed,
          handle: contactMatch.value.handle || trimmed,
          shouldPostContact: false,
        };
      }

      try {
        const resolved = await props.graffiti.handleToActor(
          `${trimmed}.graffiti.actor`
        );
        const actor =
          typeof resolved === "string" ? resolved : resolved?.actor ?? "";
        if (!actor) return null;
        return {
          actor,
          label: trimmed,
          handle: trimmed,
          shouldPostContact: true,
        };
      } catch (e) {
        console.log(e);
        return null;
      }
    }

    async function addChatParticipant() {
      const participant = await resolveChatParticipant(otherHandle.value);
      if (!participant) {
        handleError.value = true;
        handleErrorMessage.value = "This graffiti handle was not found. Please try again.";
        triggerHandleShake();
        return;
      }

      if (participant.actor === props.session?.actor) {
        handleError.value = true;
        handleErrorMessage.value = "You can't add yourself to the chat.";
        triggerHandleShake();
        return;
      }

      if (!chatParticipants.value.some((p) => p.actor === participant.actor)) {
        chatParticipants.value = [...chatParticipants.value, participant];
      }
      otherHandle.value = "";
      handleError.value = false;
      handleErrorMessage.value = "This graffiti handle was not found. Please try again.";
    }

    function removeChatParticipant(actor) {
      chatParticipants.value = chatParticipants.value.filter(
        (p) => p.actor !== actor
      );
    }

    async function createChat(name) {
      const trimmedName = String(name ?? "").trim();
      if (!trimmedName) return;
      const participants = chatParticipants.value.slice();
      if (!participants.length) return;

      submitting.value = true;

      // Capture everything we need before navigating + unmounting the sidebar.
      const graffiti = props.graffiti;
      const session = props.session;
      const appName = props.appName;
      const sessionActor = session?.actor ?? "";
      const contactsSnapshot = Array.isArray(props.contacts)
        ? props.contacts.slice()
        : [];
      const targetFolder = props.sidebarFolderChannel;

      const participantActors = participants.map((p) => p.actor);
      const recipientActors = Array.from(
        new Set(participantActors.filter((actor) => actor && actor !== sessionActor))
      );
      // Full member list (creator + recipients) is stored in the chat
      // object's `value` field so non-creators can read it. Graffiti masks
      // the `allowed` array for non-creators (they only see themselves),
      // so we cannot rely on `chat.allowed` to enumerate participants.
      const valueParticipants = Array.from(
        new Set([sessionActor, ...recipientActors].filter(Boolean))
      );

      const chatChannel = crypto.randomUUID();
      const t = Date.now();
      const chatChannelsList = [
        `${appName} chats`,
        `${sessionActor}/chats`,
      ];

      try {
        // 1. Register the optimistic chat so the chat panel can render
        //    immediately with the correct title.
        startChatCreation({
          channel: chatChannel,
          title: trimmedName,
          published: t,
          actor: sessionActor,
          allowed: recipientActors,
          channels: chatChannelsList,
          participants: valueParticipants,
        });

        // 2. Reset form + close the sidebar.
        chatParticipants.value = [];
        handleError.value = false;
        newChatName.value = "";
        otherHandle.value = "";
        props.toggleNew();

        // 3. Navigate to the new chat URL.
        router.push(`/${encodeURIComponent(chatChannel)}`);
      } catch (e) {
        console.error(e);
        finishChatCreation(chatChannel);
        handleError.value = true;
        triggerHandleShake();
        submitting.value = false;
        return;
      } finally {
        submitting.value = false;
      }

      // 4. Run the actual graffiti posts in the background. The chat panel
      //    keeps Send disabled (via pendingChatCreations) until this resolves.
      (async () => {
        try {
          for (const participant of participants) {
            const existing = contactsSnapshot.find(
              (c) => contactActorId(c) === participant.actor
            );
            if (!existing && participant.shouldPostContact) {
              await graffiti.post(
                {
                  value: {
                    actorId: participant.actor,
                    username: participant.handle,
                    handle: participant.handle,
                    published: Date.now(),
                  },
                  allowed: [],
                  channels: [
                    `${sessionActor} contacts`,
                    "my contacts",
                  ],
                },
                session
              );
            }
          }

          await graffiti.post(
            {
              value: {
                activity: "Create",
                type: "Chat",
                channel: chatChannel,
                title: trimmedName,
                published: t,
                participants: valueParticipants,
              },
              allowed: recipientActors,
              channels: chatChannelsList,
            },
            session
          );

          for (const actorId of participantActors) {
            await graffiti.post(
              {
                value: {
                  activity: "Add",
                  type: "Participant",
                  actorId,
                  published: Date.now(),
                },
                allowed: recipientActors,
                channels: [chatChannel],
              },
              session
            );
          }

          if (targetFolder) {
            await graffiti.post(
              {
                value: {
                  activity: "Add",
                  obj: chatChannel,
                  target: targetFolder,
                  published: t + 1,
                },
                allowed: [],
                channels: [`${sessionActor}/folders`],
              },
              session
            );
          }
        } catch (e) {
          console.error(e);
        } finally {
          finishChatCreation(chatChannel);
        }
      })();
    }

    // watch(graffitiActor, async (oldActor, otherActor) => {
    //   console.log('watch')
    //   if(otherActor === undefined || otherActor===""){
    //     console.log('went to default or waiting')
    //     return
    //   }
    //   if(otherActor===null){
    //     console.log('actor not found')
    //     handleError.value=true;
    //     return;
    //   }
    //   console.log('actor found')
    //     // const otherActor = graffitiActor.value;


    //   if (props.contacts.find(c => c.value.actor === otherActor) === undefined){
    //     console.log(await props.graffiti.post(
    //       {
    //         value: {
    //           actorId: otherActor,
    //           username: other,
    //           handle: other,
    //           published: Date.now(),
    //         },
    //         allowed: [],
    //         channels: [
    //           `${props.session.actor} contacts`,
    //           'my contacts'
    //         ],
    //       },
    //       props.session
    //     ));
    //   }
    //   await props.graffiti.post(
    //     {
    //       value: {
    //         activity: "Create",
    //         type: "Chat",
    //         channel: crypto.randomUUID(),
    //         title: name,
    //         published: Date.now(),
    //       },
    //       allowed: [otherActor],
    //       channels: [
    //         `${props.appName} chats`,
    //         `${props.session.actor}/chats`,
    //       ],
    //     },
    //     props.session
    //   );
    //   props.toggleNew()
    // })

    async function createGroup(name, others) {
      submitting.value = true;
      try {
        others = splitHandles(others);
        others = await Promise.all(
              others.map(async (handle) => {
                const actor = await props.graffiti.handleToActor(
                  `${handle}.graffiti.actor`
                );
                return {handle, actor};
              })
            );
        for (const other of others){
            if (props.contacts.find(c => c.value.actor === otherActor) === undefined){
              await props.graffiti.post(
                {
                  value: {
                    actor: other.actor,
                    username: other.handle,
                    handle: other.handle,
                    published: Date.now(),
                  },
                  allowed: [],
                  channels: [
                    `${props.session.actor} contacts`
                  ],
                },
                props.session
              );
            }
        }
        await props.graffiti.post(
          {
            value: {
              activity: "Create",
              type: "Group",
              channel: crypto.randomUUID(),
              title: name,
              published: Date.now(),
            },
            allowed: await Promise.all(
              others.map(async (handle) => {
                const actor = await props.graffiti.handleToActor(
                  `${handle}.graffiti.actor`
                );
                return actor;
              })
            ),
            channels: [
              `${props.appName} groups`,
              `${props.session.actor}/groups`,
            ],
          },
          props.session
        );
        props.toggleNew()
      } finally {
        submitting.value = false;
      }
    }

    async function createFolder(name) {
      submitting.value = true;
      try {
        const t = Date.now();
        const folderChannel = crypto.randomUUID();
        await props.graffiti.post(
          {
            value: {
              activity: "Create",
              type: "Folder",
              channel: folderChannel,
              title: name,
              published: t,
            },
            allowed: [],
            channels: [`${props.session.actor}/folders`],
          },
          props.session
        );
        await addObjectToOpenFolder(folderChannel, t + 1);
        props.toggleNew();
      } finally {
        submitting.value = false;
      }
    }

    return {
      ...toRefs(props),
      createChat,
      createGroup,
      createFolder,
      newChatName,
      newFolderName,
      newGroupName,
      otherHandles,
      otherHandle,
      chatParticipants,
      addChatParticipant,
      removeChatParticipant,
      handleError,
      handleErrorMessage,
      shakeHandleInput,
      clearHandleShakeAnimation,
      submitting,
      // graffitiActor
    };
  },
  template: await fetch(new URL("./NewObjectSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
