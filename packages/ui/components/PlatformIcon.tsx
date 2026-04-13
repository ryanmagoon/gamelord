import React from "react";
import { Gamepad2, Disc } from "lucide-react";
import { cn } from "../utils";

interface PlatformIconProps {
  className?: string;
  platform: string;
}

const platformIcons: Record<string, React.FC<{ className?: string }>> = {
  GB: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="2" width="10" height="20" rx="1" />
      <rect x="9" y="4" width="6" height="6" rx="0.5" />
      <rect x="9" y="12" width="2" height="2" />
      <rect x="13" y="12" width="2" height="2" />
      <rect x="11" y="14" width="2" height="2" />
      <rect x="11" y="10" width="2" height="2" />
    </svg>
  ),
  GBC: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="2" width="12" height="20" rx="1.5" />
      <rect x="8" y="4" width="8" height="7" rx="0.5" />
      <rect x="9" y="13" width="2" height="2" />
      <rect x="13" y="13" width="2" height="2" />
      <rect x="11" y="15" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      <circle cx="15" cy="5.5" r="0.8" />
    </svg>
  ),
  GBA: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="8" width="16" height="8" rx="2" />
      <rect x="6" y="10" width="6" height="4" rx="0.5" />
      <rect x="14" y="10" width="1" height="1" />
      <rect x="16" y="10" width="1" height="1" />
      <rect x="15" y="11" width="1" height="1" />
      <rect x="15" y="9" width="1" height="1" />
    </svg>
  ),
  GC: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <circle cx="14" cy="14" r="2.5" />
      <circle cx="14" cy="14" r="1" />
      <circle cx="9" cy="11" r="1" />
    </svg>
  ),
  Genesis: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="8" width="20" height="8" rx="1" />
      <circle cx="6" cy="12" r="2" />
      <rect x="12" y="10" width="1" height="1" />
      <rect x="14" y="10" width="1" height="1" />
      <rect x="16" y="10" width="1" height="1" />
      <rect x="13" y="12" width="1" height="1" />
      <rect x="15" y="12" width="1" height="1" />
      <rect x="14" y="13" width="1" height="1" />
    </svg>
  ),
  N64: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <rect x="7" y="11" width="1" height="2" />
      <rect x="16" y="11" width="1" height="2" />
      <rect x="11" y="8" width="2" height="1" />
      <rect x="11" y="15" width="2" height="1" />
    </svg>
  ),
  NES: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="8" width="20" height="8" rx="1" />
      <rect x="5" y="10" width="4" height="4" rx="0.5" />
      <circle cx="16" cy="11" r="1" />
      <circle cx="19" cy="13" r="1" />
    </svg>
  ),
  PS1: ({ className }) => <Disc className={className} />,
  Saturn: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="8" width="20" height="8" rx="4" />
      <rect x="5" y="10" width="3" height="3" rx="0.5" />
      <circle cx="15" cy="10.5" r="0.8" />
      <circle cx="17" cy="10.5" r="0.8" />
      <circle cx="19" cy="10.5" r="0.8" />
      <circle cx="15" cy="13" r="0.8" />
      <circle cx="17" cy="13" r="0.8" />
      <circle cx="19" cy="13" r="0.8" />
    </svg>
  ),
  SNES: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <rect x="4" y="10" width="4" height="4" rx="0.5" />
      <circle cx="15" cy="10" r="1" />
      <circle cx="18" cy="12" r="1" />
      <circle cx="15" cy="14" r="1" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
};

export const PlatformIcon: React.FC<PlatformIconProps> = ({ className, platform }) => {
  const Icon = platformIcons[platform] || Gamepad2;

  return <Icon className={cn("h-5 w-5", className)} />;
};
