import { createApp, defineAsyncComponent } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function loadComponent(name) {
  console.log('loaded')
  return () => import(`./components/${name}/${name}.js`).then((m) => m.default());
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: "/", component: loadComponent("home")},
    // {path: "/chat/:chatId", component: loadComponent("chat"), props: true},
    // {path: "/profile", component: loadComponent("profile")}
  ],
});

createApp({
    setup() {
        const appName = 'Talk2Me';
        const session = useGraffitiSession();
        const graffiti = useGraffiti();


        return {
            appName,
            session,
            graffiti
        };
  },
    template: "#template",
    components: {
        Home: defineAsyncComponent(loadComponent("home")),
    },
})
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(),
    // graffiti: new GraffitiDecentralized(),
  })
  .use(router)
  .mount("#app");
