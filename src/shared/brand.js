// The product's name in one place. Renaming the app means editing this file and the
// matching fields in package.json (name, productName, build.appId).
module.exports = {
  name: 'Basanite',      // shown to people
  slug: 'basanite',      // files, ids
  appId: 'com.robberttorfs.basanite', // = package.json build.appId; the Windows AppUserModelId
  // Where releases are published (GitHub Releases). Fill both in when the public
  // releases repo exists; while either is empty, update checks are off.
  releases: { owner: '', repo: '' },
};
