import { createApp, ref, computed, defineEmits } from "vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";






function setup(props, { emit }) {
	const zoom = ref(false);
    const editUsername = ref(false);
    const showList = ref('chats');

    const contact = computed(()=>{
        const allVersions = props.contacts.filter(c=> c.value.handle===props.contactId);
        allVersions.sort((a, b) => b.value.published - a.value.published)
        if (allVersions.length !== 0)
            return allVersions[0]
        return []
    })
    const usernameBuf = ref("contact.value.value.username")
    // const username = ref(contact.value.username)
    const contactChats = computed(()=>{
        props.allObjects.filter(o=>{return o.allowed.includes(contact.value.actor)&&o.value.type==='Chat'})
    })
    const contactGroups = computed(()=>{
        props.allObjects.filter(o=>{return o.allowed.includes(contact.value.actor)&&o.value.type==='Group'})
    })

    async function changeUsername(){
        console.log('changing username')
        console.log(props.contactId)

        console.log(JSON.stringify(await props.graffiti.post({
            value: {
              actor: contact.value.actor,
              username: usernameBuf.value,
              handle: props.contactId,
              published: Date.now(),
            },
            allowed: [],
            channels: [
              `${props.session.actor} contacts`,
            ],
          },
          props.session
        )))
        console.log('changed')
        editUsername.value= false;

    }

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


	// const toggleNew = () => newObject.value = !newObject.value;

    const objectsInFolder = computed(()=>{
        const objs = new Set()
        for (const update of folderUpdates.value){
            if (currentFolderForObject(folderUpdates.value, update.value.obj) !== null)
                objs.add(update.value.obj)
        }
        return objs
    })

    function openChat(chat){
        if(objectsInFolder.value.has(chat))
            openObjectFromFolder(chat)
        else
            openObjectFromRoot(chat)
    }

    function openObjectFromRoot(obj) {
        props.folderNavStack = [];
        // emit('clearNavStack')
        // props.openChatChannel = obj.value.channel;
        emit('changeChatChannel', obj.value.channel)

	}
    function openObjectFromFolder(obj) {
        // emit('addToNavStack', props.openChatChannel)
		props.folderNavStack = [...props.folderNavStack, props.openChatChannel];
		// props.openChatChannel = obj.value.channel;
        emit('changeChatChannel', obj.value.channel)
	}


	return {
        zoom,
        editUsername,
        showList,
        usernameBuf,
        contact,
        // username,
        changeUsername,
        contactChats,
        contactGroups,
        openChat

	};
}




export default async () => ({
  props: ['graffiti', 'session', 'contactId', 'contacts', 'allObjects', 'folders', 'folderNavStack', 'openChatChannel'],
  emits: ['changeChatChannel'],
  setup,
  template: await fetch(new URL("./contact.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
