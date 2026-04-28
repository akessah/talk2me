import { ref, toRefs, computed } from "vue";


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


    return {
        ...toRefs(props),
        parentFolderTitle,
        removeFromFolder,
        addMenuOpen,
        targetFolders,
        addToFolder,
        toggleMenu,
        menuOpen
    };
  },
  template: await fetch(new URL("./ObjectMenu.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
