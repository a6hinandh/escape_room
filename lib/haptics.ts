export type HapticKind = "tap" | "selection" | "success" | "warning" | "error";

function canVibrate(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

function vibrate(pattern: number | number[]) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore vibration errors (unsupported/blocked)
  }
}

export const haptics = {
  fire(kind: HapticKind = "tap") {
    switch (kind) {
      case "tap":
        vibrate(10);
        break;
      case "selection":
        vibrate(5);
        break;
      case "success":
        vibrate([10, 30, 10]);
        break;
      case "warning":
        vibrate([20, 40, 20]);
        break;
      case "error":
        vibrate([30, 30, 30]);
        break;
    }
  },
  tap() {
    haptics.fire("tap");
  },
  selection() {
    haptics.fire("selection");
  },
  success() {
    haptics.fire("success");
  },
  warning() {
    haptics.fire("warning");
  },
  error() {
    haptics.fire("error");
  },
};
