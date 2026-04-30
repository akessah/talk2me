import { ref, toRefs } from "vue";

export default {
  props: {
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },
    appName: { type: String, required: true },
    toggleNew: { type: Function, required: true },
    contacts: { type: Array, required: true }
  },
  setup(props) {
    const newChatName = ref("");
    const otherHandle = ref("");
    const newGroupName = ref("");
    const otherHandles = ref("");
    const newFolderName = ref("");

    function splitHandles(handles) {
      return handles.split(",").map((handle) => handle.trim());
    }

    async function createChat(name, other) {
      const otherActor = await props.graffiti.handleToActor(
        `${other}.graffiti.actor`
      );
      console.log(props.contacts.find(c => c.value.actor === otherActor))
      if (props.contacts.find(c => c.value.actor === otherActor) === undefined){
        console.log('adding contact')
        console.log(props.session.actor)
        console.log(typeof otherActor, typeof other)
        await props.graffiti.post(
          {
            value: {
              actor: otherActor,
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
        );
        console.log('done adding contact')
      }
      await props.graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            channel: crypto.randomUUID(),
            title: name,
            published: Date.now(),
          },
          allowed: [otherActor],
          channels: [
            `${props.appName} chats`,
            `${props.session.actor}/chats`,
          ],
        },
        props.session
      );
      props.toggleNew()
    }

    async function createGroup(name, others) {
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
    }

    async function createFolder(name) {
      await props.graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Folder",
            channel: crypto.randomUUID(),
            title: name,
            published: Date.now(),
          },
          allowed: [],
          channels: [`${props.session.actor}/folders`],
        },
        props.session
      );
      props.toggleNew()
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
    };
  },
  template: await fetch(new URL("./NewObjectSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
