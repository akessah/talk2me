import { ref, toRefs, nextTick, watch } from "vue";

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
    const newChatName = ref("");
    const otherHandle = ref("");
    const newGroupName = ref("");
    const otherHandles = ref("");
    const newFolderName = ref("");
    const handleError = ref(false);
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

    async function createChat(name, other) {
      submitting.value = true;
      try{
        let otherActor;

        const contactMatch = findContactByUsername(other);
        if (contactMatch) {
          otherActor = contactMatch.value.actorId;
        } else {
          otherActor = (await props.graffiti.handleToActor(
            `${other}.graffiti.actor`
          ));
          if (otherActor.actor)


          if (props.contacts.find(c => c.value.actor === otherActor.actor) === undefined){
            console.log(await props.graffiti.post(
              {
                value: {
                  actorId: otherActor,
                  username: other,
                  handle: other,
                  published: Date.now(),
                },
                allowed: [],
                channels: [
                  `${props.session.actor} contacts`,
                  'my contacts'
                ],
              },
              props.session
            ));
          }
        }
      console.log(1)
      const t = Date.now();
      const chatChannel = crypto.randomUUID();
      await props.graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            channel: chatChannel,
            title: name,
            published: t,
          },
          allowed: [otherActor],
          channels: [
            `${props.appName} chats`,
            `${props.session.actor}/chats`,
          ],
        },
        props.session
      );
      await props.graffiti.post(
        {
          value: {
            activity: "Add",
            type: "Participant",
            actorId: otherActor,
            published: Date.now(),
          },
          allowed: [otherActor],
          channels: [
            chatChannel
          ],
        },
        props.session
      )
      await props.graffiti.post(
        {
          value: {
            activity: "Add",
            type: "Participant",
            actorId: props.session.actor,
            published: Date.now(),
          },
          allowed: [otherActor],
          channels: [
            chatChannel
          ],
        },
        props.session
      )
      console.log(2)
      await addObjectToOpenFolder(chatChannel, t + 1);
      console.log(3)
      handleError.value = false;
      props.toggleNew();
      console.log(4)
    }catch(e){
      console.log(e)
      handleError.value=true;
      triggerHandleShake();
      return;
    } finally {
      submitting.value = false;
    }
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
      handleError,
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
