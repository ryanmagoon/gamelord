import { app, BrowserWindow, Menu, shell } from "electron";

const GITHUB_REPO_URL = "https://github.com/ryanmagoon/gamelord";

/**
 * Builds and sets the application menu. Call once after the main window is created.
 * The menu sends IPC events to the focused window for renderer-side actions
 * (e.g. opening settings, triggering a library scan).
 */
export function setupAppMenu(): void {
  const template: Array<Electron.MenuItemConstructorOptions> = [
    {
      label: app.name,
      submenu: [
        {
          label: `About ${app.name}`,
          role: "about",
        },
        { type: "separator" },
        {
          label: "Preferences...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send("menu:openSettings");
            }
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Scan Library",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send("menu:scanLibrary");
            }
          },
        },
        {
          label: "Add ROM Folder...",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send("menu:addRomFolder");
            }
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Report an Issue...",
          click: () => {
            shell.openExternal(`${GITHUB_REPO_URL}/issues`);
          },
        },
        {
          label: "Documentation",
          click: () => {
            shell.openExternal(`${GITHUB_REPO_URL}#readme`);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
