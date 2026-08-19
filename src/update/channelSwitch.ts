export type TyprChannel = "stable" | "beta" | "development";

export interface TyprChannelOption {
  id: TyprChannel;
  label: string;
  shortLabel: string;
  origin: string;
}

export const TYPR_CHANNELS: readonly TyprChannelOption[] = [
  {
    id: "stable",
    label: "Stable",
    shortLabel: "stable",
    origin: "https://typr.ca"
  },
  {
    id: "beta",
    label: "Beta",
    shortLabel: "beta",
    origin: "https://beta.typr.ca"
  },
  {
    id: "development",
    label: "Dev",
    shortLabel: "dev",
    origin: "https://dev.typr.ca"
  }
] as const;

const CHANNEL_ORIGIN_SET = new Set(TYPR_CHANNELS.map((channel) => channel.origin));

export function getTyprChannelOption(channel: TyprChannel): TyprChannelOption {
  const option = TYPR_CHANNELS.find((candidate) => candidate.id === channel);

  if (!option) {
    throw new Error(`Unknown Typr channel: ${channel}`);
  }

  return option;
}

export function isTyprChannelOrigin(origin: string): boolean {
  return CHANNEL_ORIGIN_SET.has(origin);
}

export function isInstalledPwa(targetWindow: Window = window): boolean {
  const navigatorWithStandalone = targetWindow.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    targetWindow.matchMedia?.("(display-mode: standalone)").matches === true ||
    navigatorWithStandalone.standalone === true
  );
}

export function getChannelDestination(channel: TyprChannel): string {
  return `${getTyprChannelOption(channel).origin}/`;
}
