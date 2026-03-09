/**
 * Re-export gamepad mapping constants from the shared UI package.
 * The canonical definitions live in @gamelord/ui so presentational
 * components (ControllerConfig, Storybook stories) can use them
 * without depending on the desktop app.
 */
export {
  LIBRETRO_BUTTON,
  STANDARD_GAMEPAD_MAPPING,
  ANALOG_DEADZONE,
} from "@gamelord/ui/gamepad/mappings";
