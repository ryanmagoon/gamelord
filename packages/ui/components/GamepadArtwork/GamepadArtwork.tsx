import { useId } from "react";

export type GamepadModel = "xbox" | "dualsense" | "dualshock" | "switch" | "generic";
export function detectGamepadModel(id: string): GamepadModel {
  const name = id.toLowerCase();
  if (
    name.includes("dualsense") ||
    (name.includes("054c") && (name.includes("0ce6") || name.includes("0df2")))
  ) {
    return "dualsense";
  }
  if (
    name.includes("dualshock") ||
    (name.includes("054c") && (name.includes("05c4") || name.includes("09cc")))
  ) {
    return "dualshock";
  }
  if (name.includes("xbox") || name.includes("xinput") || name.includes("045e")) {
    return "xbox";
  }
  if (
    (name.includes("switch") && name.includes("pro")) ||
    name.includes("pro controller") ||
    (name.includes("057e") && name.includes("2009"))
  ) {
    return "switch";
  }
  return "generic";
}
export function physicalButtonLabel(index: number, model: GamepadModel): string {
  const ps = model === "dualsense" || model === "dualshock";
  const face = ps
    ? ["Cross", "Circle", "Square", "Triangle"]
    : model === "switch"
      ? ["B", "A", "Y", "X"]
      : model === "generic"
        ? ["South", "East", "West", "North"]
        : ["A", "B", "X", "Y"];
  return (
    [
      ...face,
      ps ? "L1" : model === "switch" ? "L" : "LB",
      ps ? "R1" : model === "switch" ? "R" : "RB",
      ps ? "L2" : model === "switch" ? "ZL" : "LT",
      ps ? "R2" : model === "switch" ? "ZR" : "RT",
      ps ? (model === "dualsense" ? "Create" : "Share") : model === "switch" ? "Minus" : "View",
      ps ? "Options" : model === "switch" ? "Plus" : "Menu",
      "L3",
      "R3",
      "Up",
      "Down",
      "Left",
      "Right",
      "Home",
    ][index] ?? `Button ${index}`
  );
}

export function GamepadGlyph({
  button,
  model = "generic",
  className,
}: {
  button: number;
  model?: GamepadModel;
  className?: string;
}) {
  const ps = model === "dualsense" || model === "dualshock";
  const label = physicalButtonLabel(button, model);
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx={button < 4 ? 14 : 7}
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.65"
      />
      {ps && button < 4 ? (
        <g stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round">
          {button === 0 && <path d="m11 11 10 10m0-10L11 21" />}
          {button === 1 && <circle cx="16" cy="16" r="6" />}
          {button === 2 && <rect x="10" y="10" width="12" height="12" />}
          {button === 3 && <path d="m16 9 7 13H9Z" />}
        </g>
      ) : (
        <text
          x="16"
          y="17"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fontSize={label.length > 3 ? 9 : 12}
          fontWeight="700"
        >
          {button >= 12 && button <= 15
            ? ["↑", "↓", "←", "→"][button - 12]
            : label === "Menu" || label === "Options"
              ? "☰"
              : label === "View"
                ? "▣"
                : model === "generic" && button < 4
                  ? ["↓", "→", "←", "↑"][button]
                  : label}
        </text>
      )}
    </svg>
  );
}

interface Props {
  controllerId?: string;
  model?: GamepadModel;
  buttonStates?: Record<number, boolean>;
  axisValues?: Array<number>;
  highlightedButton?: number | null;
  className?: string;
}

/** Original vector artwork. Button locations follow each physical controller family. */
export function GamepadArtwork({
  controllerId = "",
  model = detectGamepadModel(controllerId),
  buttonStates = {},
  axisValues = [],
  highlightedButton,
  className,
}: Props) {
  const uid = useId().replaceAll(":", "");
  const ps = model === "dualsense" || model === "dualshock";
  const white = model === "dualsense";
  const generic = model === "generic";
  const leftStick = ps || generic ? [214, 178] : [154, 114];
  const rightStick = [306, 178];
  const dpad = ps || generic ? [148, 117] : [210, 177];
  const name = {
    xbox: "Xbox Wireless Controller",
    dualsense: "DualSense",
    dualshock: "DualShock 4",
    switch: "Nintendo Switch Pro Controller",
    generic: "Standard gamepad",
  }[model];
  const active = (index: number) => buttonStates[index] || highlightedButton === index;
  const fill = (index: number) => (active(index) ? "#a3f7b5" : "#252a32");
  const stroke = (index: number) => (active(index) ? "#e4ffec" : "#555c67");
  const stick = (position: Array<number>, axis: number, button: number) => (
    <g key={button}>
      <circle
        cx={position[0]}
        cy={position[1]}
        r="33"
        fill="#11151c"
        stroke="#4b515b"
        strokeWidth="2"
      />
      <g transform={`translate(${(axisValues[axis] ?? 0) * 8} ${(axisValues[axis + 1] ?? 0) * 8})`}>
        <circle
          cx={position[0]}
          cy={position[1]}
          r="25"
          fill={fill(button)}
          stroke={stroke(button)}
          strokeWidth="2"
        />
        <circle
          cx={position[0]}
          cy={position[1]}
          r="20"
          fill={`url(#${uid}-stick)`}
          stroke="#8b929a"
          strokeOpacity="0.25"
          strokeDasharray="1 3"
        />
        <path
          d={`M${position[0] - 11} ${position[1] - 13}q11-6 22 0`}
          fill="none"
          stroke="white"
          strokeOpacity="0.15"
        />
      </g>
    </g>
  );
  return (
    <svg
      className={className}
      viewBox="0 0 520 300"
      role="img"
      aria-label={`${name}, live button and stick display`}
      style={{ width: "100%", maxHeight: 280 }}
    >
      <defs>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0.25" y2="1">
          <stop stopColor={white ? "#fafcfe" : "#555c67"} />
          <stop offset="0.45" stopColor={white ? "#d4dce6" : "#303640"} />
          <stop offset="1" stopColor={white ? "#9ba9bb" : "#15191f"} />
        </linearGradient>
        <radialGradient id={`${uid}-stick`}>
          <stop stopColor="#363d47" />
          <stop offset="1" stopColor="#14191f" />
        </radialGradient>
        <linearGradient id={`${uid}-touch`} x2="0" y2="1">
          <stop stopColor={white ? "#e9eff6" : "#353a44"} />
          <stop offset="1" stopColor={white ? "#bdcad8" : "#1c222a"} />
        </linearGradient>
      </defs>
      <ellipse cx="260" cy="272" rx="159" ry="12" fill="#000" opacity="0.17" />
      {[6, 7].map((index, i) => (
        <rect
          key={index}
          x={i ? 339 : 112}
          y="31"
          width="69"
          height="34"
          rx="15"
          fill={fill(index)}
          stroke={stroke(index)}
        />
      ))}
      {[4, 5].map((index, i) => (
        <path
          key={index}
          d={i ? "M329 59q40-18 75 13l-5 15-72-10Z" : "M191 59q-40-18-75 13l5 15 72-10Z"}
          fill={fill(index)}
          stroke={stroke(index)}
        />
      ))}
      <path
        d={
          ps
            ? "M154 62C113 62 100 91 87 133L66 225C59 253 74 269 92 260L151 215Q172 203 191 214Q260 233 329 214Q348 203 369 215L428 260C446 269 461 253 454 225L433 133C420 91 407 62 366 62Q260 47 154 62Z"
            : "M155 62Q119 57 101 95C80 139 66 200 71 237Q74 260 95 256L156 211Q173 200 190 208Q260 225 330 208Q347 200 364 211L425 256Q446 260 449 237C454 200 440 139 419 95Q401 57 365 62Q260 45 155 62Z"
        }
        fill={`url(#${uid}-shell)`}
        stroke={white ? "#8796a8" : "#747d8a"}
        strokeWidth="1.5"
      />
      {white && (
        <path
          d="M198 141Q260 153 322 141L347 208Q312 243 260 226Q208 243 173 208Z"
          fill="#151b24"
        />
      )}
      {ps && (
        <>
          <path
            d="M206 68h108l-7 58h-94Z"
            fill={`url(#${uid}-touch)`}
            stroke={white ? "#a6b5c8" : "#687385"}
            strokeWidth="1.5"
          />
          <path
            d="M204 72l8 57m104-57-8 57"
            stroke={white ? "#66bfff" : "#67a1ff"}
            strokeWidth="2"
          />
          <g fill={white ? "#465263" : "#707985"}>
            {[0, 1, 2, 3, 4].map((i) => (
              <circle key={i} cx={248 + i * 6} cy="144" r="1.2" />
            ))}
          </g>
        </>
      )}
      {!ps && <circle cx="260" cy="85" r="12" fill={fill(16)} stroke={stroke(16)} />}
      {ps && <circle cx="260" cy="188" r="9" fill={fill(16)} stroke={stroke(16)} />}
      {[8, 9].map((index, i) => (
        <g key={index}>
          <rect
            x={ps ? (i ? 330 : 180) : i ? 283 : 218}
            y={ps ? 86 : 115}
            width={ps ? 9 : 19}
            height={ps ? 19 : 15}
            rx="5"
            fill={fill(index)}
            stroke={stroke(index)}
          />
          <path
            d={
              i
                ? ps
                  ? "M333 91v9"
                  : "M288 120h9m-9 4h9"
                : ps
                  ? "M184 91v9"
                  : "M222 119h7v6h-7Zm4-2h7v6"
            }
            fill="none"
            stroke="#bcc5d1"
          />
        </g>
      ))}
      {stick(leftStick, 0, 10)}
      {stick(rightStick, 2, 11)}
      <g transform={`translate(${dpad[0]} ${dpad[1]})`}>
        <circle r="31" fill="#171d25" stroke="#616977" strokeOpacity="0.4" />
        {[12, 15, 13, 14].map((index, i) => (
          <g key={index} transform={`rotate(${i * 90})`}>
            <path
              d="M-9-6v-20h18v20l-9 6Z"
              fill={fill(index)}
              stroke={stroke(index)}
              strokeLinejoin="round"
            />
            <path d="m-3-16 3-4 3 4" fill="none" stroke="#9aa5b5" />
          </g>
        ))}
      </g>
      {[0, 1, 2, 3].map((index) => {
        const [x, y] = [
          [374, 143],
          [399, 118],
          [349, 118],
          [374, 93],
        ][index];
        const colors = ps
          ? ["#a7caff", "#f0a2aa", "#dca6d2", "#9ae4cd"]
          : ["#9bdf91", "#f07d78", "#83b8ef", "#efd275"];
        return (
          <g
            key={index}
            aria-label={`${physicalButtonLabel(index, model)}${active(index) ? " pressed" : ""}`}
          >
            <circle
              cx={x}
              cy={y}
              r="16"
              fill={fill(index)}
              stroke={stroke(index)}
              strokeWidth="1.5"
            />
            <g
              transform={`translate(${x - 12} ${y - 12}) scale(.75)`}
              color={active(index) ? "#163723" : colors[index]}
            >
              <GamepadGlyph button={index} model={model} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
