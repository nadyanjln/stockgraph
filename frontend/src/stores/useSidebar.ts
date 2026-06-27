import { computed, ref } from "vue";

const STORAGE_KEY = "stockgraph_sidebar_collapsed";

const collapsed = ref<boolean>(localStorage.getItem(STORAGE_KEY) === "1");

const sidebarWidth = computed(() => (collapsed.value ? "64px" : "280px"));

function toggle() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(STORAGE_KEY, collapsed.value ? "1" : "0");
}

export function useSidebar() {
  return { collapsed, sidebarWidth, toggle };
}
