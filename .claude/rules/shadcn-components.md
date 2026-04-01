# Use Existing shadcn/Radix Primitives

Never hand-roll a UI primitive (toggle, switch, select, dialog, dropdown, etc.) when a shadcn/Radix equivalent exists or can be added. Check `packages/ui/components/ui/` before building custom interactive elements.

If the component doesn't exist yet, install the Radix primitive (`@radix-ui/react-*`), create the shadcn wrapper in `packages/ui/components/ui/`, and export it from `packages/ui/index.ts` — then use it. This ensures consistent accessibility, keyboard handling, and styling across the app.
