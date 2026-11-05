// Everything the site says about the product's name and where downloads live.
// The app's name is a placeholder (see src/shared/brand.js); a rename is one edit here.
export default {
  name: 'Hangar OSS',
  // The public GitHub repo. Releases come from it too.
  // TODO owner: the open-source repo doesn't exist yet; set these when it does.
  owner: 'robberttorfs',
  repo: 'hangar-oss',
  // Artifact names, from package.json build.dmg.artifactName and build.win.artifactName.
  artifacts: {
    macArm: 'Hangar-mac-arm64.dmg',
    macIntel: 'Hangar-mac-x64.dmg',
    win: 'Hangar-windows-x64-setup.exe',
    winArm: 'Hangar-windows-arm64-setup.exe',
  },
  // Where the site itself lives (absolute URLs for link previews). Placeholder until deploy.
  siteUrl: 'https://hangar-oss.vercel.app',
  // Where people install Claude Code from.
  claudeCode: 'https://code.claude.com',
};
