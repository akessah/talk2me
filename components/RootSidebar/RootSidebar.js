import { ref, toRefs } from "vue";
export default {
  props: ['allObjects', 'openChatChannel', 'openObjectFromRoot'],
  setup(props) {
    return {
      ...toRefs(props),
    };
  },
  template: await fetch(new URL("./RootSidebar.html", import.meta.url)).then((r) =>
    r.text(),
  )
}
