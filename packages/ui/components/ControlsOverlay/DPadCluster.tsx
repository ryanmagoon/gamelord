import React from "react";
import { KeyBadge } from "./KeyBadge";

/** D-pad rendered as a cross of 4 arrow-key badges with a label beneath the cluster. */
export function DPadCluster({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className ?? ""}`}>
      <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-[5.5rem]" data-button-id="dpad">
        <div />
        <KeyBadge>{"\u2191"}</KeyBadge>
        <div />
        <KeyBadge>{"\u2190"}</KeyBadge>
        <div />
        <KeyBadge>{"\u2192"}</KeyBadge>
        <div />
        <KeyBadge>{"\u2193"}</KeyBadge>
        <div />
      </div>
      <span className="text-[9px] text-white/40 leading-none">D-Pad</span>
    </div>
  );
}
