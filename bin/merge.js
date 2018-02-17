#!/usr/bin/env node
const exec = require('./exec');

(async function main() {

  const branchName = await exec('git', [ 'rev-parse', '--abbrev-ref', 'HEAD' ]);
  if (branchName === 'HEAD') {
    console.log('Can\'t merge detached head');
    process.exit(1);
  }
  if (branchName === 'master') {
    console.log('You\'re on the master branch, checkout branch to merge.');
    process.exit();
  }

  console.log(`=> Found branch ${branchName}, checking out master`);

  console.log(await exec('git', [ 'checkout', 'master' ]));

  console.log(`=> Attempting to merge`);

  console.log(await exec('git', ['merge', '--ff-only', branchName]));

  console.log('=> Attempting to push');

  console.log(await exec('git', ['push', 'origin', 'master']));
})();