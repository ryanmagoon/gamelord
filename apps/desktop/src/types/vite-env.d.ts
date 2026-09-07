/// <reference types="electron-vite/node" />

declare module "*.css" {}

declare module "*.glb?url" {
  const url: string;
  export default url;
}
