// Everything the site says about the product's name and where downloads live.
export default {
  name: 'Basanite',
  // The public GitHub repo. Releases come from it too.
  // TODO owner: the open-source repo doesn't exist yet; set these when it does.
  owner: 'robberttorfs',
  repo: 'hangar-oss',
  // Artifact names, from package.json build.dmg.artifactName and build.win.artifactName.
  artifacts: {
    macArm: 'Basanite-mac-arm64.dmg',
    macIntel: 'Basanite-mac-x64.dmg',
    win: 'Basanite-windows-x64-setup.exe',
    winArm: 'Basanite-windows-arm64-setup.exe',
  },
  // Where the site itself lives (absolute URLs for link previews). Placeholder until deploy.
  siteUrl: 'https://basanite.vercel.app',
  // Where people install Claude Code from.
  claudeCode: 'https://code.claude.com',
};
