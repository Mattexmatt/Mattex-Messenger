import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ── Android Notification Channels ─────────────────────────────────────────────
// Messages: MAX importance, vibration, private lockscreen
// Memes: DEFAULT importance, no sound, silent badge
export async function setupNotificationChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("messages", {
    name: "Direct Messages",
    description: "Private messages from your contacts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 100, 200, 100],
    lightColor: "#7C3AED",
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    bypassDnd: false,
    showBadge: true,
    enableVibrate: true,
    enableLights: true,
  });

  await Notifications.setNotificationChannelAsync("memes", {
    name: "Community Memes",
    description: "New posts from the M Chat public meme feed",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: null,
    lightColor: "#F59E0B",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    enableVibrate: false,
    enableLights: false,
  });
}

// ── iOS/Android Notification Categories ───────────────────────────────────────
// "message": Inline Quick Reply + Mark as Read (no app foreground needed)
// "meme": View Post (opens app)
export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync("message", [
    {
      identifier: "REPLY",
      buttonTitle: "Reply",
      textInput: {
        submitButtonTitle: "Send",
        placeholder: "Type a reply…",
      },
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
        opensAppToForeground: false,
      },
    },
    {
      identifier: "MARK_READ",
      buttonTitle: "Mark as Read",
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
        opensAppToForeground: false,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("meme", [
    {
      identifier: "VIEW",
      buttonTitle: "View Post",
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
        opensAppToForeground: true,
      },
    },
  ]);
}

export async function setupNotifications() {
  await Promise.all([setupNotificationChannels(), setupNotificationCategories()]);
}
