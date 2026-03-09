const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const path = require("node:path");

/**
 * afterPack hook — flip Electron fuses before signing.
 * Runs after the .app is assembled but before codesign + notarize.
 * @param {import('app-builder-lib').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productName}.app`,
  );

  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
