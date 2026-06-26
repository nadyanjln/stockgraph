<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  modelValue: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    default: "text",
  },
  placeholder: {
    type: String,
    default: "",
  },
  autocomplete: {
    type: String,
    default: "off",
  },
  error: {
    type: String,
    default: "",
  },
  icon: {
    type: String,
    default: "",
  },
  toggleable: {
    type: Boolean,
    default: false,
  },
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "toggle-visibility"]);

const inputType = computed(() => {
  if (!props.toggleable) return props.type;
  return props.visible ? "text" : "password";
});

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:modelValue", target?.value ?? "");
}
</script>

<template>
  <div class="auth-input">
    <label :for="id" class="auth-input__label">{{ label }}</label>
    <div class="auth-input__control" :class="{ 'auth-input__control--error': !!error }">
      <i v-if="icon" class="auth-input__icon pi" :class="icon" aria-hidden="true" />
      <input
        :id="id"
        :type="inputType"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        @input="onInput"
      />
      <button
        v-if="toggleable"
        type="button"
        class="auth-input__toggle"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        @click="$emit('toggle-visibility')"
      >
        <i class="pi" :class="visible ? 'pi-eye-slash' : 'pi-eye'" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" class="auth-input__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.auth-input {
  display: grid;
  gap: 8px;
}

.auth-input__label {
  font-size: 14px;
  font-weight: 600;
  color: #1b2743;
}

.auth-input__control {
  min-height: 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid #c7d3e8;
  background: #ffffff;
  /* Render native inputs (incl. autofill/reveal) in light mode so the field
     doesn't inherit the OS dark-mode background. */
  color-scheme: light;
  padding: 0 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.auth-input__control:hover {
  border-color: #87a5df;
}

.auth-input__control:focus-within {
  border-color: #3878e8;
  box-shadow: 0 0 0 3px rgba(56, 120, 232, 0.14);
}

.auth-input__control--error {
  border-color: #dc4c64;
}

.auth-input__icon {
  color: #60749d;
  font-size: 15px;
}

.auth-input input {
  flex: 1;
  border: 0;
  outline: none;
  min-width: 0;
  font-size: 15px;
  font-family: inherit;
  color: #1a2642;
  background: transparent;
}

/* Hide the browser's built-in password reveal/clear button (Edge/IE) so only
   our custom toggle eye remains. */
.auth-input input::-ms-reveal,
.auth-input input::-ms-clear {
  display: none;
}

/* Keep Chrome/Edge autofill from repainting the field dark. */
.auth-input input:-webkit-autofill,
.auth-input input:-webkit-autofill:hover,
.auth-input input:-webkit-autofill:focus {
  -webkit-text-fill-color: #1a2642;
  box-shadow: 0 0 0 1000px #ffffff inset;
}

.auth-input input::placeholder {
  color: #93a3bf;
}

.auth-input__toggle {
  border: 0;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  color: #49608d;
}

.auth-input__toggle:hover {
  background: #eff4ff;
}

.auth-input__error {
  margin: 0;
  font-size: 13px;
  color: #c13851;
}

@media (prefers-color-scheme: dark) {
  .auth-input__label {
    color: #dce6f8;
  }

  .auth-input__control {
    border-color: #3a465c;
    background: #111824;
    color-scheme: dark;
  }

  .auth-input input {
    color: #edf3ff;
  }

  .auth-input input:-webkit-autofill,
  .auth-input input:-webkit-autofill:hover,
  .auth-input input:-webkit-autofill:focus {
    -webkit-text-fill-color: #edf3ff;
    box-shadow: 0 0 0 1000px #111824 inset;
  }
}
</style>
