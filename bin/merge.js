#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const execa = require('execa');

function trim(foo) {
  return `${foo}`.trim();
}

const npmBin = trim(spawnSync('npm', [ 'bin' ]).stdout);

spawnSync('export', [ 'PATH="$(npm bin):$PATH"' ]);

async function exec(command, args, options = {}, suppress = true) {
  try {
    const response = await execa(command, args, {
      env: {
        PATH: `${npmBin}:${process.env.PATH}`,
      },
      ...options,
    });
    if (suppress === false && response.stderr) {
      throw new Error(response.stderr);
    }
    return trim(
      response.stdout,
    );
  } catch (err) {
    if (suppress) {
      return '';
    }
    throw err;
  }
}


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