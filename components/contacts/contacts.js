import { ref, computed, nextTick, watch } from "vue";
import { initialsFromLabel } from "../objectInitials.js";

function setup(props) {
	// const contactHandles = computed(() => new Set(props.contacts.map(c => c.value.handle)))
    function contactActorId(c) {
        const v = c?.value;
        return v?.actorId ?? v?.actor ?? "";
    }

    const curContacts = computed(()=>{
        const latestByContact = new Map();
        for (const object of props.contacts || []) {
            const actorId = contactActorId(object);
            const handle = object?.value?.handle ?? "";
            const key = actorId || handle;
            if (!key) continue;
            const published = object?.value?.published ?? 0;
            const current = latestByContact.get(key);
            if (!current || (current?.value?.published ?? 0) < published) {
                latestByContact.set(key, object);
            }
        }

        return Array.from(latestByContact.values()).sort((a, b) => {
            const aName = (a?.value?.username ?? a?.value?.handle ?? "").toLowerCase();
            const bName = (b?.value?.username ?? b?.value?.handle ?? "").toLowerCase();
            return aName.localeCompare(bName);
        });
    })

    const showAddContactForm = ref(false);
    const newContactHandle = ref("");
    const newContactUsername = ref("");
    const contactFormError = ref("");
    const contactFormSubmitting = ref(false);
    const handleError = ref(false);
    const handleErrorMessage = ref("This graffiti handle was not found. Please try again.");
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
        handleErrorMessage.value = "This graffiti handle was not found. Please try again.";
    });

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
                handleErrorMessage.value = "This graffiti handle was not found. Please try again.";
                triggerHandleShake();
                return;
            }
            if (otherActor === props.session?.actor) {
                handleError.value = true;
                handleErrorMessage.value = "You can't add yourself as a contact.";
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
        handleErrorMessage,
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
