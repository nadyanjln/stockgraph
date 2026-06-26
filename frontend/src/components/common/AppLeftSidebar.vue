<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AccountDialog, {
  type AccountDialogMode,
} from "@/components/common/AccountDialog.vue";
import { useSidebar } from "@/stores/useSidebar";
import { useAuth } from "@/stores/useAuth";
import { useChatSession } from "@/stores/useChatSession";
import type { ConversationDto } from "@/types/api";

const router = useRouter();
const { collapsed, toggle } = useSidebar();
const {
  isAuthenticated,
  username,
  email,
  initials,
  avatar,
  provider,
  userId,
  createdAt,
  logout,
} = useAuth();
const { listConversations, loadConversation, newChat } = useChatSession();

const conversations = ref<ConversationDto[]>([]);
const searchTerm = ref("");
const profileMenuOpen = ref(false);
const profileMenuRef = ref<HTMLElement | null>(null);
const activeDialog = ref<AccountDialogMode>(null);

const filteredConversations = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  if (!query) return conversations.value;
  return conversations.value.filter((conversation) =>
    conversationTitle(conversation).toLowerCase().includes(query),
  );
});

async function refreshConversations() {
  conversations.value = await listConversations();
}

function conversationTitle(conversation: ConversationDto): string {
  const title = conversation.title?.trim();
  return title || `Percakapan #${conversation.id}`;
}

async function openConversation(id: number) {
  await loadConversation(id);
  await router.push({ name: "result" });
}

function startNewChat() {
  newChat();
  void router.push({ name: "home" });
}

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
}

function openAccountDialog(mode: Exclude<AccountDialogMode, null>) {
  closeProfileMenu();
  activeDialog.value = mode;
}

async function confirmLogout() {
  try {
    await logout();
  } finally {
    activeDialog.value = null;
    await router.push({ name: "login" });
  }
}

function handleDocumentClick(event: MouseEvent) {
  if (!profileMenuRef.value) return;
  const target = event.target as Node | null;
  if (target && !profileMenuRef.value.contains(target)) closeProfileMenu();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeProfileMenu();
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeydown);
  void refreshConversations();
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <aside class="left-rail" :class="{ 'is-collapsed': collapsed }">
    <button
      type="button"
      class="collapse-toggle"
      :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="toggle"
    >
      <i :class="collapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" />
    </button>

    <template v-if="!collapsed">
      <label class="rail-search-wrap">
        <i class="pi pi-search" aria-hidden="true" />
        <input
          v-model="searchTerm"
          type="search"
          placeholder="Search conversations"
          class="rail-search"
        />
      </label>

      <section class="rail-log" aria-label="Conversation history">
        <p class="rail-log-title">Conversation history</p>
        <ul>
          <li v-for="conversation in filteredConversations" :key="conversation.id">
            <button
              type="button"
              :title="conversationTitle(conversation)"
              @click="openConversation(conversation.id)"
            >
              <i class="pi pi-comment" aria-hidden="true" />
              <span>{{ conversationTitle(conversation) }}</span>
            </button>
          </li>
          <li v-if="!filteredConversations.length" class="rail-log-empty">
            {{ searchTerm ? "No matching conversations." : "Belum ada percakapan." }}
          </li>
        </ul>
      </section>

      <div class="rail-bottom">
        <button type="button" class="new-conversation-btn" @click="startNewChat">
          <i class="pi pi-plus" aria-hidden="true" />
          <span>New conversation</span>
        </button>

        <div ref="profileMenuRef" class="profile-menu-wrap">
          <Transition name="profile-menu">
            <div v-if="profileMenuOpen" class="profile-dropdown" @click.stop>
              <div class="menu-account">
                <div class="avatar avatar--menu">
                  <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
                  <span v-else>{{ initials }}</span>
                </div>
                <div class="profile-text">
                  <p class="name">{{ username || "StockGraph User" }}</p>
                  <p class="mail">{{ email || "Email not available" }}</p>
                </div>
              </div>

              <div class="menu-divider" />

              <button type="button" class="menu-item" @click="openAccountDialog('profile')">
                <i class="pi pi-user" aria-hidden="true" />
                <span>Profile</span>
              </button>
              <button type="button" class="menu-item" @click="openAccountDialog('settings')">
                <i class="pi pi-cog" aria-hidden="true" />
                <span>Settings</span>
              </button>
              <button type="button" class="menu-item" @click="openAccountDialog('feedback')">
                <i class="pi pi-comment" aria-hidden="true" />
                <span>Feedback</span>
              </button>

              <div class="menu-divider" />

              <button
                type="button"
                class="menu-item menu-item--danger"
                @click="openAccountDialog('logout')"
              >
                <i class="pi pi-sign-out" aria-hidden="true" />
                <span>Log out</span>
              </button>
            </div>
          </Transition>

          <button
            type="button"
            class="profile-card"
            :aria-expanded="profileMenuOpen"
            aria-label="Open account menu"
            @click.stop="toggleProfileMenu"
          >
            <div class="avatar">
              <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
              <span v-else>{{ initials }}</span>
            </div>
            <div class="profile-text">
              <p class="name">{{ username || "StockGraph User" }}</p>
              <p class="mail">{{ email || "Email not available" }}</p>
            </div>
            <i
              class="pi pi-chevron-up profile-chevron"
              :class="{ 'is-open': profileMenuOpen }"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <nav class="rail-icons" aria-label="Sidebar shortcuts">
        <button type="button" class="rail-icon-btn" title="New conversation" @click="startNewChat">
          <i class="pi pi-plus" />
        </button>
        <button type="button" class="rail-icon-btn" title="Search conversations" @click="toggle">
          <i class="pi pi-search" />
        </button>
        <button type="button" class="rail-icon-btn" title="Conversation history" @click="toggle">
          <i class="pi pi-comments" />
        </button>
      </nav>

      <button
        type="button"
        class="collapsed-profile"
        :title="username"
        @click="openAccountDialog('profile')"
      >
        <div class="avatar avatar--small">
          <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
          <span v-else>{{ initials }}</span>
        </div>
      </button>
    </template>
  </aside>

  <AccountDialog
    :mode="activeDialog"
    :name="username"
    :email="email"
    :avatar="avatar"
    :initials="initials"
    :provider="provider"
    :user-id="userId"
    :created-at="createdAt"
    :is-authenticated="isAuthenticated"
    @close="activeDialog = null"
    @request-sign-out="activeDialog = 'logout'"
    @sign-out="confirmLogout"
  />
</template>

<style scoped>
.left-rail {
  position: relative;
  width: 100%;
  min-height: 0;
  padding: 16px;
  border: 1px solid rgba(255,255,255,.055);
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #edf1f8;
  background: linear-gradient(180deg, rgba(31,32,36,.98), rgba(25,26,29,.99));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
}
.left-rail.is-collapsed { padding: 17px 10px; align-items: center; }
.collapse-toggle { display: none; }
.rail-search-wrap {
  min-height: 42px;
  padding: 0 13px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #8f97a5;
  background: rgba(255,255,255,.045);
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
.rail-search-wrap:focus-within { border-color: rgba(80,139,255,.65); background: rgba(255,255,255,.065); box-shadow: 0 0 0 3px rgba(60,121,241,.12); }
.rail-search-wrap i { font-size: 13px; }
.rail-search { width: 100%; border: 0; outline: 0; color: #edf1f8; background: transparent; font: inherit; font-size: 12px; }
.rail-search::placeholder { color: #858c98; }
.rail-search::-webkit-search-cancel-button { filter: invert(1); opacity: .45; }
.rail-log { width: 100%; min-width: 0; max-width: 100%; flex: 1; min-height: 0; overflow: hidden; }
.rail-log-title { margin: 0 0 9px; padding: 0 4px; color: #8d94a0; font-size: 10px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.rail-log ul { width: 100%; min-width: 0; max-width: 100%; max-height: 100%; overflow-x: hidden; overflow-y: auto; list-style: none; margin: 0; padding: 0 3px 0 0; display: grid; align-content: start; gap: 3px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.14) transparent; }
.rail-log li { min-width: 0; max-width: 100%; overflow: hidden; }
.rail-log li button {
  width: 100%; min-width: 0; max-width: 100%; min-height: 38px; padding: 8px 9px; border: 0; border-radius: 10px;
  display: flex; align-items: center; gap: 9px; color: #b8bec9; background: transparent;
  overflow: hidden; font: inherit; font-size: 11px; text-align: left; cursor: pointer;
  transition: color .16s ease, background .16s ease;
}
.rail-log li button i { flex: 0 0 auto; color: #777f8d; font-size: 11px; }
.rail-log li button span { min-width: 0; max-width: 100%; flex: 1; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rail-log li button:hover { color: #f5f7fb; background: rgba(255,255,255,.06); }
.rail-log li button:hover i { color: #72a6ff; }
.rail-log-empty { padding: 10px 9px; color: #6f7682; font-size: 11px; font-style: italic; }
.rail-bottom { margin-top: auto; display: grid; gap: 14px; }
.new-conversation-btn {
  width: 100%; min-height: 42px; padding: 0 14px; border: 0; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; gap: 9px;
  color: #fff; background: linear-gradient(135deg, #286ee8, #4288ff);
  box-shadow: 0 8px 20px rgba(36,105,230,.22); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.new-conversation-btn:hover { transform: translateY(-1px); filter: brightness(1.06); box-shadow: 0 11px 25px rgba(36,105,230,.3); }
.profile-menu-wrap { position: relative; min-width: 0; }
.profile-card {
  width: 100%; min-height: 62px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.09); border-radius: 17px;
  display: flex; align-items: center; gap: 10px; color: #f2f4f8;
  background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.035));
  backdrop-filter: blur(14px); font: inherit; cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
.profile-card:hover { transform: translateY(-1px) scale(1.006); border-color: rgba(255,255,255,.18); background: linear-gradient(135deg, rgba(255,255,255,.095), rgba(255,255,255,.05)); box-shadow: 0 10px 24px rgba(0,0,0,.2), 0 0 0 1px rgba(70,130,245,.08); }
.avatar { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; color: #fff; background: #596476; font-size: 13px; font-weight: 750; }
.avatar img { width: 100%; height: 100%; display: block; object-fit: cover; }
.avatar--menu { width: 46px; height: 46px; flex-basis: 46px; }
.avatar--small { width: 36px; height: 36px; flex-basis: 36px; }
.profile-text { min-width: 0; flex: 1; display: grid; gap: 2px; text-align: left; }
.name, .mail { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { color: #f4f6fb; font-size: 12px; font-weight: 750; }
.mail { color: #969eab; font-size: 10px; }
.profile-chevron { color: #8e96a4; font-size: 11px; transition: transform .18s ease, color .18s ease; }
.profile-chevron.is-open { transform: rotate(180deg); color: #dce2ed; }
.profile-dropdown {
  position: absolute; left: 0; right: 0; bottom: calc(100% + 10px); z-index: 30;
  max-width: 100%; padding: 9px; border: 1px solid rgba(255,255,255,.12); border-radius: 18px;
  color: #edf0f6; background: linear-gradient(155deg, rgba(47,49,56,.99), rgba(31,33,39,.99));
  box-shadow: 0 22px 50px rgba(0,0,0,.5); backdrop-filter: blur(18px); transform-origin: bottom;
}
.menu-account { padding: 9px; display: flex; align-items: center; gap: 11px; }
.menu-divider { height: 1px; margin: 7px 5px; background: rgba(255,255,255,.1); }
.menu-item {
  width: 100%; min-height: 42px; padding: 0 11px; border: 0; border-radius: 11px;
  display: flex; align-items: center; gap: 11px; color: #dce0e8; background: transparent;
  font: inherit; font-size: 12px; text-align: left; cursor: pointer; transition: color .15s ease, background .15s ease;
}
.menu-item i { width: 17px; color: #aab1be; font-size: 15px; }
.menu-item:hover { color: #fff; background: rgba(255,255,255,.075); }
.menu-item:hover i { color: #8eb5ff; }
.menu-item--danger { color: #ffb6bd; }
.menu-item--danger i, .menu-item--danger:hover i { color: #ff929d; }
.profile-menu-enter-active, .profile-menu-leave-active { transition: opacity .18s ease, transform .18s ease; }
.profile-menu-enter-from, .profile-menu-leave-to { opacity: 0; transform: translateY(8px) scale(.985); }
.rail-icons { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.rail-icon-btn, .collapsed-profile { width: 40px; height: 40px; padding: 0; border: 0; border-radius: 11px; display: grid; place-items: center; color: #aab1bd; background: transparent; cursor: pointer; }
.rail-icon-btn:hover { color: #fff; background: rgba(67,128,244,.17); }
.collapsed-profile { margin-top: auto; border-radius: 50%; }
@media (max-width: 1080px) {
  .left-rail { width: 100%; }
}
@media (max-width: 720px) {
  .profile-dropdown { position: fixed; left: 12px; right: 12px; bottom: 82px; width: auto; max-width: none; }
  .profile-card { min-height: 58px; }
}
</style>
