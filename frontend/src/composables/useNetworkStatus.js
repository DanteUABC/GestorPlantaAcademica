import { ref } from 'vue';

// Estado reactivo singleton compartido globalmente en la aplicación
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
const showReconnectedBanner = ref(false);
const syncTrigger = ref(0);

let listenersRegistered = false;

function handleOffline() {
  isOnline.value = false;
  showReconnectedBanner.value = false;
}

function handleOnline() {
  const wasOffline = !isOnline.value;
  isOnline.value = true;
  if (wasOffline) {
    showReconnectedBanner.value = true;
    syncTrigger.value++;
  }
}

export function registerNetworkListeners() {
  if (typeof window !== 'undefined' && !listenersRegistered) {
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    listenersRegistered = true;
  }
}

// Auto-registro inicial si se ejecuta en entorno de navegador
registerNetworkListeners();

export function useNetworkStatus() {
  return {
    isOnline,
    showReconnectedBanner,
    syncTrigger,

    // Helpers para pruebas y manipulación controlada
    setOnline(val) {
      if (val) {
        handleOnline();
      } else {
        handleOffline();
      }
    },
    resetNetworkStatus() {
      isOnline.value = typeof navigator !== 'undefined' ? navigator.onLine : true;
      showReconnectedBanner.value = false;
      syncTrigger.value = 0;
    }
  };
}
