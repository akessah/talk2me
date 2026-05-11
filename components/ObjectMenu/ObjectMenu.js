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
        const current = parentFolderChannel.value;
        if (!props.objectChannel || !current) return;
        const folderBackFn = props.folderBack;

        const updates = Array.isArray(props.folderUpdates)
            ? props.folderUpdates
            : [];
        const grandparent = currentFolderForObject(updates, current);

        if (grandparent) {
            await addObjectExclusiveToFolder({
                graffiti: props.graffiti,
                session: props.session,
                objectChannel: props.objectChannel,
                targetFolderChannel: grandparent,
                folderUpdates: updates,
            });
        } else {
            await props.graffiti.post(
                {
                    value: {
                        activity: "Remove",
                        obj: props.objectChannel,
                        target: current,
                        published: Date.now(),
                    },
                    allowed: [],
                    channels: [`${props.session.actor}/folders`],
                },
                props.session
            );
        }

        if (typeof folderBackFn === "function") {
            folderBackFn();
        }
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

    async function postChatDeletion(chatChannel) {
      await props.graffiti.post(
        {
          value: {
            activity: "DeleteChat",
            chatChannel,
            published: Date.now(),
          },
          allowed: [],
          channels: [`${props.session.actor}/chat-deletions`],
        },
        props.session
      );
    }

    async function postFolderRemove(objChannel, targetFolderChannel) {
      await props.graffiti.post(
        {
          value: {
            activity: "Remove",
            obj: objChannel,
            target: targetFolderChannel,
            published: Date.now(),
          },
          allowed: [],
          channels: [`${props.session.actor}/folders`],
        },
        props.session
      );
    }

    async function recursivelyDeleteFolder(folderChannel) {
      const updates = Array.isArray(props.folderUpdates)
        ? props.folderUpdates
        : [];
      const allObjs = Array.isArray(props.allObjects) ? props.allObjects : [];

      // Snapshot the children up front so concurrent updates don't perturb
      // the iteration.
      const childrenSnapshot = [];
      for (const obj of allObjs) {
        const ch = obj?.value?.channel;
        if (!ch) continue;
        if (currentFolderForObject(updates, ch) !== folderChannel) continue;
        childrenSnapshot.push(obj);
      }

      for (const obj of childrenSnapshot) {
        const ch = obj.value.channel;
        const type = obj.value.type;
        if (type === "Folder") {
          await recursivelyDeleteFolder(ch);
        } else if (type === "Chat" || type === "Group") {
          try {
            await postChatDeletion(ch);
            await postFolderRemove(ch, folderChannel);
          } catch (e) {
            console.error(e);
          }
        }
      }

      const folderObj = allObjs.find(
        (o) => o?.value?.channel === folderChannel
      );
      if (folderObj) {
        try {
          await props.graffiti.delete(folderObj, props.session);
        } catch (e) {
          console.error(e);
        }
      }
    }

    async function emptyAndDeleteFolder() {
      if (!props.objectChannel) return;
      if (objectType.value !== "Folder") return;

      const folderChannel = props.objectChannel;
      const parent = parentFolderChannel.value || "";
      const folderBackFn = props.folderBack;

      const destinationLabel = parent
        ? `"${parentFolderTitle.value}"`
        : "the root";

      const confirmed = window.confirm(
        `Empty and delete this folder?\n\n` +
          `Everything inside this folder will be moved to ${destinationLabel}, ` +
          `then the folder will be deleted.\n\n` +
          `Other participants are unaffected.`
      );
      if (!confirmed) return;

      try {
        const updates = Array.isArray(props.folderUpdates)
          ? props.folderUpdates
          : [];
        const allObjs = Array.isArray(props.allObjects)
          ? props.allObjects
          : [];

        const childChannels = [];
        for (const obj of allObjs) {
          const ch = obj?.value?.channel;
          if (!ch) continue;
          if (currentFolderForObject(updates, ch) !== folderChannel) continue;
          childChannels.push(ch);
        }

        for (const ch of childChannels) {
          if (parent) {
            await addObjectExclusiveToFolder({
              graffiti: props.graffiti,
              session: props.session,
              objectChannel: ch,
              targetFolderChannel: parent,
              folderUpdates: updates,
            });
          } else {
            await postFolderRemove(ch, folderChannel);
          }
        }

        // Detach this folder from its own parent (if any) before hard-delete.
        if (parent) {
          await postFolderRemove(folderChannel, parent);
        }

        const folderObj = allObjs.find(
          (o) => o?.value?.channel === folderChannel
        );
        if (folderObj) {
          try {
            await props.graffiti.delete(folderObj, props.session);
          } catch (e) {
            console.error(e);
          }
        }
      } catch (e) {
        console.error(e);
        return;
      }

      menuOpen.value = false;
      addMenuOpen.value = false;

      if (typeof folderBackFn === "function") {
        folderBackFn();
      }
    }

    async function deleteObject() {
      if (!props.objectChannel) return;
      const type = objectType.value;
      const folderBackFn = props.folderBack;

      if (type === "Chat" || type === "Group") {
        const confirmed = window.confirm(
          "Delete this chat?\n\n" +
            "All messages up to now will be hidden from your view. " +
            "If another participant sends a new message, the chat will " +
            "reappear from that message onward.\n\n" +
            "Other participants will still see the chat and its history."
        );
        if (!confirmed) return;

        try {
          await postChatDeletion(props.objectChannel);
        } catch (e) {
          console.error(e);
          return;
        }
      } else if (type === "Folder") {
        const confirmed = window.confirm(
          "Delete this folder?\n\n" +
            "This will permanently delete the folder and any sub-folders " +
            "inside it. Chats and groups inside (including those nested in " +
            "sub-folders) will be hidden from your view the same way " +
            "deleting a chat does — their messages up to now will be " +
            "hidden, and they will reappear at the root level if another " +
            "participant sends a new message.\n\n" +
            "Other participants will still see all of those chats and " +
            "their history."
        );
        if (!confirmed) return;

        try {
          // Detach the top-level folder from its parent (if any) so any
          // stale Add records don't dangle. Do this before hard-delete
          // so the folder is gone from the parent's view cleanly.
          const parent = parentFolderChannel.value;
          if (parent) {
            await postFolderRemove(props.objectChannel, parent);
          }

          await recursivelyDeleteFolder(props.objectChannel);
        } catch (e) {
          console.error(e);
          return;
        }
      } else {
        return;
      }

      menuOpen.value = false;
      addMenuOpen.value = false;

      if (typeof folderBackFn === "function") {
        folderBackFn();
      }
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
        deleteObject,
        emptyAndDeleteFolder,
    };
  },
  template: await fetch(new URL("./ObjectMenu.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
