import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";

const meta: Meta<typeof Dialog> = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Settings</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure your application preferences.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Name</label>
            <Input placeholder="Enter your name" />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Edit Profile</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your profile information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input defaultValue="player1" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" placeholder="you@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Wide: Story = {
  name: "Wide (Settings Layout)",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Settings</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" hideCloseButton>
        <div className="flex h-[480px]">
          <nav className="w-44 shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-1">
            <DialogTitle className="px-2 pb-2 text-sm font-semibold text-muted-foreground">
              Settings
            </DialogTitle>
            {["General", "Emulation", "Library", "About"].map((tab) => (
              <button
                key={tab}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground first:bg-accent first:text-accent-foreground first:font-medium"
              >
                {tab}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-semibold mb-3">Appearance</h3>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">
                  Choose light, dark, or match your system
                </div>
              </div>
              <Button variant="outline" size="sm">
                System
              </Button>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">UI sounds</div>
                <div className="text-xs text-muted-foreground">
                  Play retro sounds for UI interactions
                </div>
              </div>
              <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary">
                <span className="inline-block h-4 w-4 rounded-full bg-background translate-x-6" />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ),
};
