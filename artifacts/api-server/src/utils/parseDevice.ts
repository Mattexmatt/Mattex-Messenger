export function parseDevice(ua: string): { deviceName: string; platform: string } {
  if (!ua) return { deviceName: "Unknown Device", platform: "unknown" };

  const lower = ua.toLowerCase();

  let platform = "unknown";
  let deviceName = "Unknown Device";

  if (lower.includes("iphone")) {
    platform = "ios";
    deviceName = "iPhone";
  } else if (lower.includes("ipad")) {
    platform = "ios";
    deviceName = "iPad";
  } else if (lower.includes("android")) {
    platform = "android";
    const match = ua.match(/Android [^;)]+;?\s*([^;)]+Build)/i);
    if (match) {
      deviceName = match[1].trim().replace(/Build.*/, "").trim();
    } else {
      deviceName = "Android Device";
    }
  } else if (lower.includes("expo")) {
    platform = "expo";
    deviceName = "Expo App";
  } else if (lower.includes("macintosh") || lower.includes("mac os x")) {
    platform = "macos";
    deviceName = "Mac";
  } else if (lower.includes("windows")) {
    platform = "windows";
    deviceName = "Windows PC";
  } else if (lower.includes("linux")) {
    platform = "linux";
    deviceName = "Linux";
  } else if (lower.includes("darwin")) {
    platform = "macos";
    deviceName = "Mac";
  }

  const browserMatch = ua.match(/(Chrome|Safari|Firefox|Edge|Opera|Brave)\/[\d.]+/i);
  if (browserMatch && (platform === "macos" || platform === "windows" || platform === "linux")) {
    deviceName = `${browserMatch[1]} on ${deviceName}`;
  }

  return { deviceName, platform };
}
