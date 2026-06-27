<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useAuth } from "@/stores/useAuth";

export type AccountDialogMode = "profile" | "settings" | "feedback" | "logout" | null;

const props = defineProps<{
  mode: AccountDialogMode;
  name: string;
  email: string;
  avatar: string;
  initials: string;
  provider: string;
  userId: string;
  createdAt: string;
  isAuthenticated: boolean;
}>();

const emit = defineEmits<{
  close: [];
  signOut: [];
  requestSignOut: [];
}>();

const { updateDisplayName } = useAuth();
const feedbackCategory = ref("General Feedback");
const feedbackMessage = ref("");
const feedbackError = ref("");
const toastVisible = ref(false);
const toastMessage = ref("");
const changeNameOpen = ref(false);
const displayNameDraft = ref("");
const displayNameError = ref("");
const displayNameSaving = ref(false);
const displayNameInput = ref<HTMLInputElement | null>(null);
let toastTimer: number | undefined;

const providerLabel = computed(() => {
  const value = props.provider?.trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Email";
});

function formatDate(value: string, includeTime = false): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function showToast(message: string) {
  toastMessage.value = message;
  toastVisible.value = true;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false;
  }, 3200);
}

async function openChangeName() {
  displayNameDraft.value = props.name;
  displayNameError.value = "";
  changeNameOpen.value = true;
  await nextTick();
  displayNameInput.value?.focus();
}

function closeChangeName() {
  if (displayNameSaving.value) return;
  changeNameOpen.value = false;
  displayNameError.value = "";
}

async function saveDisplayName() {
  displayNameError.value = "";
  displayNameSaving.value = true;
  try {
    await updateDisplayName(displayNameDraft.value);
    changeNameOpen.value = false;
    showToast("Display name updated successfully.");
  } catch (error) {
    displayNameError.value =
      error instanceof Error ? error.message : "Display name could not be updated.";
  } finally {
    displayNameSaving.value = false;
  }
}

function submitFeedback() {
  feedbackError.value = "";
  const message = feedbackMessage.value.trim();
  if (!message) {
    feedbackError.value = "Please enter your feedback.";
    return;
  }

  let existing: unknown[] = [];
  try {
    const storedFeedback = JSON.parse(
      localStorage.getItem("stockgraph_feedback") || "[]",
    ) as unknown;
    existing = Array.isArray(storedFeedback) ? storedFeedback : [];
  } catch {
    existing = [];
  }
  existing.push({
    category: feedbackCategory.value,
    message,
    submitted_at: new Date().toISOString(),
    user_email: props.email,
  });
  localStorage.setItem("stockgraph_feedback", JSON.stringify(existing));
  feedbackMessage.value = "";
  feedbackCategory.value = "General Feedback";
  emit("close");
  showToast("Thank you for your feedback.");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (changeNameOpen.value) {
    closeChangeName();
  } else if (props.mode) {
    emit("close");
  }
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="account-modal">
      <div v-if="mode" class="account-backdrop" @mousedown.self="$emit('close')">
        <section
          class="account-dialog"
          :class="{ 'account-dialog--compact': mode === 'logout' }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`account-dialog-${mode}`"
        >
          <button
            type="button"
            class="dialog-close"
            aria-label="Close dialog"
            @click="$emit('close')"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>

          <template v-if="mode === 'profile'">
            <header class="dialog-header">
              <p class="dialog-eyebrow">Account</p>
              <h2 id="account-dialog-profile">Your profile</h2>
              <p>Information connected to your StockGraph account.</p>
            </header>
            <div class="profile-hero">
              <div class="dialog-avatar">
                <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
                <span v-else>{{ initials }}</span>
              </div>
              <div>
                <strong>{{ name || "StockGraph User" }}</strong>
                <span>{{ email || "Email not available" }}</span>
              </div>
            </div>
            <dl class="detail-list">
              <div><dt>Full name</dt><dd>{{ name || "Not available" }}</dd></div>
              <div><dt>Email</dt><dd>{{ email || "Not available" }}</dd></div>
              <div><dt>Login provider</dt><dd>{{ providerLabel }}</dd></div>
              <div><dt>User ID</dt><dd class="detail-mono">{{ userId || "Not available" }}</dd></div>
              <div><dt>Account created</dt><dd>{{ formatDate(createdAt) }}</dd></div>
            </dl>
          </template>

          <template v-else-if="mode === 'settings'">
            <header class="dialog-header">
              <p class="dialog-eyebrow">Account</p>
              <h2 id="account-dialog-settings">Settings</h2>
              <p>Manage your StockGraph account and active session.</p>
            </header>
            <div class="settings-section">
              <h3>Account Information</h3>
              <dl class="detail-list detail-list--compact">
                <div><dt>Full Name</dt><dd>{{ name || "Not available" }}</dd></div>
                <div><dt>Email Address</dt><dd>{{ email || "Not available" }}</dd></div>
                <div><dt>Login Provider</dt><dd>{{ providerLabel }}</dd></div>
              </dl>
            </div>
            <div class="settings-section">
              <h3>Account Actions</h3>
              <div class="account-action-list">
                <button type="button" @click="openChangeName">
                  <span class="action-icon"><i class="pi pi-pencil" /></span>
                  <span>
                    <strong>Change Display Name</strong>
                    <small>Update the name shown across StockGraph.</small>
                  </span>
                  <i class="pi pi-chevron-right action-chevron" />
                </button>
                <button
                  type="button"
                  class="account-action--danger"
                  @click="$emit('requestSignOut')"
                >
                  <span class="action-icon"><i class="pi pi-sign-out" /></span>
                  <span>
                    <strong>Sign Out</strong>
                    <small>End this session on this device.</small>
                  </span>
                  <i class="pi pi-chevron-right action-chevron" />
                </button>
              </div>
            </div>
            <div class="settings-section">
              <h3>Session Information</h3>
              <dl class="detail-list detail-list--compact">
                <div><dt>User ID</dt><dd class="detail-mono">{{ userId || "Not available" }}</dd></div>
                <div>
                  <dt>Session Status</dt>
                  <dd><span class="status-pill">{{ isAuthenticated ? "Active" : "Signed out" }}</span></dd>
                </div>
              </dl>
            </div>
            <div class="settings-section">
              <h3>About</h3>
              <dl class="detail-list detail-list--compact">
                <div><dt>Application Version</dt><dd>StockGraph 1.1.0</dd></div>
              </dl>
            </div>
          </template>

          <template v-else-if="mode === 'feedback'">
            <header class="dialog-header">
              <p class="dialog-eyebrow">StockGraph</p>
              <h2 id="account-dialog-feedback">Send Feedback</h2>
              <p>Tell us what worked, what did not, or what you would like next.</p>
            </header>
            <form class="feedback-form" @submit.prevent="submitFeedback">
              <label>
                <span>Category</span>
                <select v-model="feedbackCategory">
                  <option>Bug Report</option>
                  <option>Feature Request</option>
                  <option>General Feedback</option>
                </select>
              </label>
              <label>
                <span>Message</span>
                <textarea
                  v-model="feedbackMessage"
                  rows="6"
                  placeholder="Share your feedback..."
                />
                <small v-if="feedbackError" role="alert">{{ feedbackError }}</small>
              </label>
              <div class="dialog-actions">
                <button type="button" class="secondary-btn" @click="$emit('close')">Cancel</button>
                <button type="submit" class="primary-btn">Submit</button>
              </div>
            </form>
          </template>

          <template v-else>
            <div class="logout-icon"><i class="pi pi-sign-out" /></div>
            <header class="dialog-header dialog-header--center">
              <h2 id="account-dialog-logout">Sign out?</h2>
              <p>You will need to sign in again to access your conversations.</p>
            </header>
            <div class="dialog-actions dialog-actions--center">
              <button type="button" class="secondary-btn" @click="$emit('close')">Cancel</button>
              <button type="button" class="danger-btn" @click="$emit('signOut')">Sign Out</button>
            </div>
          </template>
        </section>
      </div>
    </Transition>

    <Transition name="account-modal">
      <div v-if="changeNameOpen" class="account-backdrop account-backdrop--nested">
        <section
          class="account-dialog account-dialog--compact"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-display-name-title"
        >
          <button
            type="button"
            class="dialog-close"
            aria-label="Close dialog"
            :disabled="displayNameSaving"
            @click="closeChangeName"
          >
            <i class="pi pi-times" />
          </button>
          <header class="dialog-header">
            <p class="dialog-eyebrow">Profile</p>
            <h2 id="change-display-name-title">Change Display Name</h2>
            <p>Your new name will appear in the sidebar and profile immediately.</p>
          </header>
          <form class="change-name-form" @submit.prevent="saveDisplayName">
            <label for="display-name">Display name</label>
            <input
              id="display-name"
              ref="displayNameInput"
              v-model="displayNameDraft"
              type="text"
              maxlength="100"
              autocomplete="name"
              :disabled="displayNameSaving"
            />
            <small v-if="displayNameError" role="alert">{{ displayNameError }}</small>
            <div class="dialog-actions">
              <button
                type="button"
                class="secondary-btn"
                :disabled="displayNameSaving"
                @click="closeChangeName"
              >
                Cancel
              </button>
              <button type="submit" class="primary-btn" :disabled="displayNameSaving">
                <i v-if="displayNameSaving" class="pi pi-spin pi-spinner" />
                {{ displayNameSaving ? "Saving..." : "Save" }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <Transition name="toast">
      <div v-if="toastVisible" class="feedback-toast" role="status">
        <i class="pi pi-check-circle" />
        {{ toastMessage }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.account-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  overflow-y: auto;
  background: rgba(5, 7, 12, .72);
  backdrop-filter: blur(8px);
}
.account-backdrop--nested { z-index: 1050; }
.account-dialog {
  position: relative;
  width: min(100%, 540px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 22px;
  padding: 28px;
  color: #eef1f7;
  background: linear-gradient(145deg, rgba(35,37,44,.98), rgba(23,25,30,.99));
  box-shadow: 0 28px 80px rgba(0,0,0,.52);
}
.account-dialog--compact { width: min(100%, 430px); }
.dialog-close {
  position: absolute; top: 18px; right: 18px; width: 34px; height: 34px;
  border: 0; border-radius: 10px; color: #aeb4c1; background: transparent; cursor: pointer;
}
.dialog-close:hover { color: #fff; background: rgba(255,255,255,.08); }
.dialog-header { padding-right: 34px; }
.dialog-header h2 { margin: 3px 0 7px; font-size: 24px; letter-spacing: -.025em; }
.dialog-header p { margin: 0; color: #aeb4c1; font-size: 13px; line-height: 1.55; }
.dialog-header--center { padding: 0; text-align: center; }
.dialog-eyebrow { color: #6ea8ff !important; font-size: 10px !important; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.profile-hero { margin: 24px 0 18px; display: flex; align-items: center; gap: 14px; }
.profile-hero div:last-child { min-width: 0; display: grid; gap: 4px; }
.profile-hero strong { font-size: 17px; }
.profile-hero span { color: #aeb4c1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
.dialog-avatar { width: 58px; height: 58px; flex: 0 0 58px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: #536071; font-weight: 700; }
.dialog-avatar img { width: 100%; height: 100%; object-fit: cover; }
.detail-list { margin: 0; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; overflow: hidden; }
.detail-list div { padding: 13px 15px; display: grid; grid-template-columns: 135px minmax(0,1fr); gap: 14px; border-bottom: 1px solid rgba(255,255,255,.07); }
.detail-list div:last-child { border-bottom: 0; }
.detail-list dt { color: #949ba9; font-size: 12px; }
.detail-list dd { min-width: 0; margin: 0; text-align: right; color: #edf0f6; font-size: 12px; overflow-wrap: anywhere; }
.detail-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.settings-section { margin-top: 22px; }
.settings-section h3 { margin: 0 0 10px; font-size: 13px; }
.detail-list--compact div { padding: 11px 14px; }
.status-pill { display: inline-flex; padding: 3px 8px; border-radius: 999px; color: #9ee6b3; background: rgba(48,180,91,.14); }
.account-action-list { border: 1px solid rgba(255,255,255,.08); border-radius: 16px; overflow: hidden; }
.account-action-list button { width: 100%; min-height: 62px; padding: 10px 14px; border: 0; border-bottom: 1px solid rgba(255,255,255,.07); display: flex; align-items: center; gap: 11px; color: #e8ebf1; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.account-action-list button:last-child { border-bottom: 0; }
.account-action-list button:hover { background: rgba(255,255,255,.055); }
.account-action-list button > span:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 3px; }
.account-action-list strong { font-size: 12px; }
.account-action-list small { color: #929aa7; font-size: 10px; font-weight: 500; }
.action-icon { width: 32px; height: 32px; flex: 0 0 32px; border-radius: 10px; display: grid; place-items: center; color: #94b9ff; background: rgba(57,116,230,.14); }
.action-chevron { color: #737b89; font-size: 10px; }
.account-action--danger strong, .account-action--danger .action-icon { color: #ff9fa8; }
.account-action--danger .action-icon { background: rgba(218,73,87,.12); }
.change-name-form { margin-top: 22px; display: grid; gap: 9px; }
.change-name-form label { color: #dfe3eb; font-size: 12px; font-weight: 700; }
.change-name-form input { width: 100%; min-height: 46px; border: 1px solid rgba(255,255,255,.13); border-radius: 12px; padding: 0 13px; color: #f0f2f7; background: #17191e; font: inherit; outline: 0; }
.change-name-form input:focus { border-color: #4d8dff; box-shadow: 0 0 0 3px rgba(77,141,255,.16); }
.change-name-form small { color: #ff9fa8; font-size: 11px; }
.change-name-form .dialog-actions { margin-top: 12px; }
.feedback-form { margin-top: 22px; display: grid; gap: 17px; }
.feedback-form label { display: grid; gap: 8px; color: #dfe3eb; font-size: 13px; font-weight: 650; }
.feedback-form select, .feedback-form textarea { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 13px; padding: 12px 13px; color: #eef1f7; background: #17191e; font: inherit; outline: 0; }
.feedback-form textarea { resize: vertical; min-height: 130px; line-height: 1.5; }
.feedback-form select:focus, .feedback-form textarea:focus { border-color: #4d8dff; box-shadow: 0 0 0 3px rgba(77,141,255,.16); }
.feedback-form small { color: #ff9fa8; font-weight: 500; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 4px; }
.dialog-actions--center { justify-content: center; margin-top: 24px; }
.secondary-btn, .primary-btn, .danger-btn { min-height: 42px; border-radius: 12px; padding: 0 17px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.secondary-btn { border: 1px solid rgba(255,255,255,.12); color: #e5e8ef; background: transparent; }
.primary-btn { border: 0; color: #fff; background: #3478f6; }
.danger-btn { border: 0; color: #fff; background: #d94b58; }
.logout-icon { width: 48px; height: 48px; margin: 0 auto 15px; border-radius: 15px; display: grid; place-items: center; color: #ff9fa8; background: rgba(218,73,87,.14); font-size: 20px; }
.feedback-toast { position: fixed; z-index: 1100; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; max-width: calc(100vw - 28px); padding: 12px 16px; border: 1px solid rgba(124,226,153,.25); border-radius: 13px; color: #dffff0; background: rgba(23,43,31,.96); box-shadow: 0 16px 40px rgba(0,0,0,.35); font-size: 13px; }
.account-modal-enter-active, .account-modal-leave-active { transition: opacity .18s ease; }
.account-modal-enter-active .account-dialog, .account-modal-leave-active .account-dialog { transition: transform .18s ease, opacity .18s ease; }
.account-modal-enter-from, .account-modal-leave-to { opacity: 0; }
.account-modal-enter-from .account-dialog, .account-modal-leave-to .account-dialog { opacity: 0; transform: scale(.97) translateY(8px); }
.toast-enter-active, .toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
@media (max-width: 560px) {
  .account-backdrop { align-items: end; padding: 10px; }
  .account-dialog { width: 100%; max-height: calc(100dvh - 20px); border-radius: 20px; padding: 23px 18px; }
  .detail-list div { grid-template-columns: 1fr; gap: 4px; }
  .detail-list dd { text-align: left; }
}
</style>
