import { ref, computed, nextTick, watch } from "vue";
import { initialsFromLabel } from "../objectInitials.js";

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

    const showAddContactForm = ref(false);
    const newContactHandle = ref("");
    const newContactUsername = ref("");
    const contactFormError = ref("");
    const contactFormSubmitting = ref(false);
    const handleError = ref(false);
    const shakeHandleInput = ref(false);

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

    watch(newContactHandle, () => {
        handleError.value = false;
    });

    function contactActorId(c) {
        const v = c?.value;
        return v?.actorId ?? v?.actor ?? "";
    }

    function contactInitials(contact) {
        return initialsFromLabel(
            contact?.value?.username ?? contact?.value?.handle ?? "",
        );
    }

    async function resolveHandle(handle) {
        try {
            const result = await props.graffiti.handleToActor(
                `${handle}.graffiti.actor`,
            );
            if (!result) return null;
            if (typeof result === "string") return result;
            if (typeof result === "object" && result.actor) return result.actor;
            return null;
        } catch (e) {
            return null;
        }
    }

    async function createContact() {
        contactFormError.value = "";
        handleError.value = false;
        const handle = newContactHandle.value.trim();
        const username =
            newContactUsername.value.trim() || handle;
        if (!handle) {
            contactFormError.value = "Handle is required.";
            return;
        }
        contactFormSubmitting.value = true;
        try {
            const otherActor = await resolveHandle(handle);
            if (!otherActor) {
                handleError.value = true;
                triggerHandleShake();
                return;
            }
            const duplicate = props.contacts.some(
                (c) =>
                    contactActorId(c) === otherActor ||
                    c.value?.handle === handle,
            );
            if (duplicate) {
                contactFormError.value =
                    "That contact is already in your list.";
                return;
            }
            await props.graffiti.post(
                {
                    value: {
                        actorId: otherActor,
                        username,
                        handle,
                        published: Date.now(),
                    },
                    allowed: [],
                    channels: [
                        `${props.session.actor} contacts`,
                        "my contacts",
                    ],
                },
                props.session,
            );
            newContactHandle.value = "";
            newContactUsername.value = "";
            showAddContactForm.value = false;
        } catch (e) {
            contactFormError.value =
                e?.message ?? "Could not add contact.";
        } finally {
            contactFormSubmitting.value = false;
        }
    }


	return {
        curContacts,
        showAddContactForm,
        newContactHandle,
        newContactUsername,
        contactFormError,
        contactFormSubmitting,
        handleError,
        shakeHandleInput,
        clearHandleShakeAnimation,
        createContact,
        contactInitials,
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
