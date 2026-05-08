import { ref, toRefs, computed, watch, onUnmounted, nextTick } from "vue";


export default {
  props: {
    folderUpdates: { type: [Array, Object], default: () => [] },
    allObjects: { type: Array, default: () => [] },
    objectChannel: { type: String, default: "" },
    folders: { type: Array, required: true},
    session: { type: Object, required: true },
    graffiti: { type: Object, required: true },
    folderNavStack: { type: Array, requred: true},
    folderBack: {type: Function, required: true}
  },
  setup(props) {
    const menuOpen = ref(false);
    const addMenuOpen = ref(false);
    const menuButtonRef = ref(null);
    const menuListRef = ref(null);

    function onDocumentClick(e) {
      if (!menuOpen.value) return;
      const t = e.target;
      if (
        menuButtonRef.value?.contains(t) ||
        menuListRef.value?.contains(t)
      ) {
        return;
      }
      menuOpen.value = false;
      addMenuOpen.value = false;
    }

    let documentListenerOn = false;
    watch(menuOpen, (open) => {
      if (open) {
        nextTick(() => {
          setTimeout(() => {
            if (!menuOpen.value) return;
            document.addEventListener("click", onDocumentClick);
            documentListenerOn = true;
          }, 0);
        });
      } else if (documentListenerOn) {
        document.removeEventListener("click", onDocumentClick);
        documentListenerOn = false;
      }
    });

    onUnmounted(() => {
      if (documentListenerOn) {
        document.removeEventListener("click", onDocumentClick);
        documentListenerOn = false;
      }
    });

    const targetFolders = computed(() => {
        const raw = props.folders;
        const list = Array.isArray(raw) ? raw : [];
        return list.filter((f) => f.value.channel !== props.objectChannel);
    });

    async function addToFolder(targetChannel) {
        if (!props.objectChannel) return;
        const raw = props.folderUpdates;
        const folderUpdates = Array.isArray(raw) ? raw : [];
        await addObjectExclusiveToFolder({
            graffiti: props.graffiti,
            session: props.session,
            objectChannel: props.objectChannel,
            targetFolderChannel: targetChannel,
            folderUpdates,
        });
        addMenuOpen.value = false;
    }

    function toggleMenu() {
        addMenuOpen.value = !addMenuOpen.value;
    }

    const objectType = computed(() => {
      if (!props.objectChannel) return "";
      const list = Array.isArray(props.allObjects) ? props.allObjects : [];
      const obj = list.find((o) => o.value?.channel === props.objectChannel);
      return obj?.value?.type ?? "";
    });

    const parentFolderChannel = computed(() => {
        const s = props.folderNavStack;
        if (!s.length) return "";
        return s[s.length - 1];
    });

    const parentFolderTitle = computed(() => {
        const id = parentFolderChannel.value;
        if (!id) return "folder";
        const list = Array.isArray(props.allObjects) ? props.allObjects : [];
        const obj = list.find((o) => o.value.channel === id);
        return obj?.value?.title ?? "folder";
    });

    async function removeFromFolder() {
        const target = parentFolderChannel.value;
        if (!props.objectChannel || !target) return;
        await props.graffiti.post(
        {
            value: {
            activity: "Remove",
            obj: props.objectChannel,
            target,
            published: Date.now(),
            },
            allowed: [],
            channels: [`${props.session.actor}/folders`],
        },
        props.session
        );
        folderBack();
    }

    async function createFolderAndMove() {
      if (!props.objectChannel) return;

      const titleRaw = window.prompt("New folder name:");
      const title = (titleRaw ?? "").trim();
      if (!title) return;

      // Create the folder object itself.
      const folderChannel = crypto.randomUUID();
      const now = Date.now();
      await props.graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Folder",
            channel: folderChannel,
            title,
            published: now,
          },
          allowed: [],
          channels: [`${props.session.actor}/folders`],
        },
        props.session
      );

      // Place the new folder into the currently open folder.
      // - If the object we're moving is a folder, "open folder" means the folder itself,
      //   so we put the new folder one level up (parentFolderChannel).
      // - Otherwise (chat/group), put the new folder into the open folder (parentFolderChannel).
      // In both cases, parentFolderChannel is the folder currently open in the sidebar.
      const parent = parentFolderChannel.value;
      if (parent) {
        await props.graffiti.post(
          {
            value: {
              activity: "Add",
              obj: folderChannel,
              target: parent,
              published: now + 1,
            },
            allowed: [],
            channels: [`${props.session.actor}/folders`],
          },
          props.session
        );
      }

      // Finally, move the current object into the new folder.
      await addToFolder(folderChannel);
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

    function folderTargetsContainingObject(updates, objectChannel) {
      const byPair = latestFolderUpdatesByPair(updates);
      const targets = [];
      for (const u of byPair.values()) {
        if (u.value.obj === objectChannel && u.value.activity === "Add") {
          targets.push(u.value.target);
        }
      }
      return targets;
    }

    async function addObjectExclusiveToFolder({
      graffiti,
      session,
      objectChannel,
      targetFolderChannel,
      folderUpdates,
    }) {
      const updates = Array.isArray(folderUpdates) ? folderUpdates : [];
      let t = Date.now();
      const nextTs = () => {
        t += 1;
        return t;
      };

      const targets = folderTargetsContainingObject(updates, objectChannel);

      for (const folderId of targets) {
        if (folderId !== targetFolderChannel) {
          await graffiti.post(
            {
              value: {
                activity: "Remove",
                obj: objectChannel,
                target: folderId,
                published: nextTs(),
              },
              allowed: [],
              channels: [`${session.actor}/folders`],
            },
            session
          );
        }
      }

      const alreadyOnlyHere =
        targets.length === 1 && targets[0] === targetFolderChannel;
      if (alreadyOnlyHere) return;

      await graffiti.post(
        {
          value: {
            activity: "Add",
            obj: objectChannel,
            target: targetFolderChannel,
            published: nextTs(),
          },
          allowed: [],
          channels: [`${session.actor}/folders`],
        },
        session
      );
    }

    async function deleteObject() {
      await props.graffiti.delete

    }


    return {
        ...toRefs(props),
        parentFolderTitle,
        removeFromFolder,
        addMenuOpen,
        targetFolders,
        addToFolder,
        createFolderAndMove,
        toggleMenu,
        menuOpen,
        menuButtonRef,
        menuListRef,
        objectType,
    };
  },
  template: await fetch(new URL("./ObjectMenu.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
