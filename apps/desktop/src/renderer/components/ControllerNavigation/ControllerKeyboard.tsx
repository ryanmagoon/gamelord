import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@gamelord/ui";

/** Controller text entry uses the field's existing React input/change path. */
export function ControllerKeyboard() {
  const [field, setField] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");
  const [upper, setUpper] = useState(false);
  const target = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      if (
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      target.current = event.target;
      setField(event.target);
      setValue(event.target.value);
    };
    window.addEventListener("gamelord:keyboard", open);
    return () => window.removeEventListener("gamelord:keyboard", open);
  }, []);
  const close = () => setField(null);
  const apply = () => {
    if (!field?.isConnected) {
      close();
      return;
    }
    const proto =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };
  return (
    <Dialog
      open={!!field}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          target.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Enter text</DialogTitle>
          <DialogDescription>
            Select letters with the controller. Apply saves your text.
          </DialogDescription>
        </DialogHeader>
        <output
          aria-label="Text preview"
          className="block min-h-12 rounded-md border px-3 py-3 break-all"
        >
          {field instanceof HTMLInputElement && field.type === "password"
            ? "•".repeat(value.length)
            : value || " "}
        </output>
        {["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", "@._-/:!?"].map((row) => (
          <div key={row} className="flex justify-center gap-1">
            {Array.from(upper ? row.toUpperCase() : row).map((char) => (
              <Button
                key={char}
                variant="outline"
                className="h-10 w-10 p-0"
                onClick={() => setValue((current) => current + char)}
              >
                {char}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" aria-pressed={upper} onClick={() => setUpper(!upper)}>
            Shift
          </Button>
          <Button variant="outline" onClick={() => setValue((current) => current + " ")}>
            Space
          </Button>
          <Button
            variant="outline"
            onClick={() => setValue((current) => Array.from(current).slice(0, -1).join(""))}
          >
            Delete
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
