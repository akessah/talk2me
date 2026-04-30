import { createApp, ref, computed, defineEmits } from "vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";






function setup(props) {
	// const contactHandles = computed(() => new Set(props.contacts.map(c => c.value.handle)))
    const curContacts = computed(()=>{
        return Object.values(
            props.contacts.reduce((acc, object) => {
                    const { id, published } = object.value;
                    if (!acc[id] || acc[id].value.published < published) {
                    acc[id] = object;
                }
                return acc;
            }, {}),
        )
    })


	return {
        curContacts

	};
}




export default async () => ({
  props: ['graffiti', 'session', 'contactId', 'contacts', 'allObjects', 'folders', 'folderNavStack', 'openChatChannel'],
//   emits: ['changeChatChannel'],
  setup,
  template: await fetch(new URL("./contacts.html", import.meta.url)).then((r) =>
    r.text(),
  ),
});
