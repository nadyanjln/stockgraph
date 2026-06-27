import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import { definePreset } from "@primeuix/themes";
import Tooltip from "primevue/tooltip";
import App from "./App.vue";
import router from "./router";
import "./styles/global.css";
import "primeicons/primeicons.css";

// Override default Aura primary (emerald) jadi biru agar checkbox, slider,
// fokus ring, dll mengikuti warna brand StockGraph (#2b7afb).
const StockGraphPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{blue.50}",
      100: "{blue.100}",
      200: "{blue.200}",
      300: "{blue.300}",
      400: "{blue.400}",
      500: "{blue.500}",
      600: "{blue.600}",
      700: "{blue.700}",
      800: "{blue.800}",
      900: "{blue.900}",
      950: "{blue.950}",
    },
  },
});

const app = createApp(App);

app
  .use(PrimeVue, {
    theme: {
      preset: StockGraphPreset,
    },
  })
  .use(router);

app.directive("tooltip", Tooltip);
app.mount("#app");
