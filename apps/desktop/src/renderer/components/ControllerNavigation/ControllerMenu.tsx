import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@gamelord/ui";
import { Play, Save, FolderOpen, Camera, Settings, Library } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onScreenshot: () => void;
  onSettings: () => void;
  onQuit: () => void;
  slot: number;
  onSlot: (slot: number) => void;
  savesSupported: boolean;
}
export function ControllerMenu({
  open,
  title,
  onClose,
  onResume,
  onSave,
  onLoad,
  onScreenshot,
  onSettings,
  onQuit,
  slot,
  onSlot,
  savesSupported,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="controller-game-menu sm:max-w-md border-white/15 bg-[#171b22] text-white"
        hideCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">Game paused</DialogTitle>
          <DialogDescription className="text-white/60">{title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 mt-3">
          <Button onClick={onResume} className="h-12 justify-start gap-3">
            <Play size={18} /> Resume game
          </Button>
          {savesSupported && (
            <>
              <Select value={String(slot)} onValueChange={(value) => onSlot(Number(value))}>
                <SelectTrigger aria-label="Save slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <SelectItem key={i} value={String(i)}>
                      Save slot {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" className="h-12 justify-start gap-3" onClick={onSave}>
                <Save size={18} /> Save state
              </Button>
              <Button variant="ghost" className="h-12 justify-start gap-3" onClick={onLoad}>
                <FolderOpen size={18} /> Load state
              </Button>
            </>
          )}
          <Button variant="ghost" className="h-12 justify-start gap-3" onClick={onScreenshot}>
            <Camera size={18} /> Take screenshot
          </Button>
          <Button variant="ghost" className="h-12 justify-start gap-3" onClick={onSettings}>
            <Settings size={18} /> Settings
          </Button>
          <Button variant="ghost" className="h-12 justify-start gap-3" onClick={onQuit}>
            <Library size={18} /> Return to library
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
