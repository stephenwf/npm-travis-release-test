#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const packageJson = require(__dirname + '/../package.json');
const lernaJson = require(__dirname + '/../lerna.json');
const argv = require('yargs').argv;
const inquirer = require('inquirer');
const semver = require('semver');
const execa = require('execa');

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.log('WARNING: Not github token found, this may cause problems when commiting.');
}

const npmBin = trim(spawnSync('npm', [ 'bin' ]).stdout);

spawnSync('export', [ 'PATH="$(npm bin):$PATH"' ]);

function trim(foo) {
  return `${foo}`.trim();
}

async function continueWithRelease() {
  if (argv[ 'y' ] || argv[ 'yes' ]) {
    return;
  }

  const userResponse = await inquirer.prompt({ type: 'confirm', name: 'continue', message: 'Continue with release?' });
  if (!userResponse[ 'continue' ]) {
    console.log('Aborting release...');
    process.exit(1);
  }
}

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

async function releaseNextVersion() {
  const nextArgs = [ 'publish', '--skip-git', '--npm-tag=next', '--canary=next' ];
  console.log('\n=> Preparing to release new "next" tag');
  if (!argv[ 'y' ] && !argv[ 'yes' ]) {
    console.log(await exec('lerna', nextArgs).replace(/\r?\n?[^\r\n]*$/, ''));
    await continueWithRelease();
  }
  console.log(await exec('lerna', [ ...nextArgs, '--yes' ]));
}

async function releaseLatestVersion() {
  const latestArgs = [ 'exec', 'publish' ];
  console.log('\n=> Preparing to release new "latest" tag');
  if (!argv[ 'y' ] && !argv[ 'yes' ] && !argv[ 'ls' ]) {
    console.log(await exec('lerna', [ 'ls' ]));
    await continueWithRelease();
  }

  console.log(await exec('lerna', latestArgs));
}

(async function main() {
  console.log('=> Checking installed versions...');
  console.log(`Node version   ${await exec('node', [ '-v' ])}`);
  console.log(`NPM version    v${await exec('npm', [ '-v' ])}`);
  const lerna = await exec('lerna', [ '-v' ]);
  console.log(`Lerna version  v${lerna}`);

  if (lerna !== lernaJson.lerna) {
    console.log(`\nERROR: Mismatched Lerna version.
 => found: ${lerna}
 => expected: ${lernaJson.lerna}
 
 Looks like you may not have ran NPM install into this directory. 
`);
    process.exit(1);
  }

  if (argv[ 'diff' ]) {

    console.log('\n=> Showing changes since last release:');
    console.log(await exec('lerna', [ 'diff' ]));

    await continueWithRelease();
  }

  if (argv[ 'ls' ]) {

    console.log('\n=> Current package versions:');
    console.log(await exec('lerna', [ 'ls' ]));

    await continueWithRelease();
  }

  // On Travis + Master branch
  if (argv[ 'next' ]) {
    return await releaseNextVersion();
  }

  // On Travis + Master branch + Tag
  if (argv[ 'latest' ]) {
    return await releaseLatestVersion();
  }

  // Default steps.
  const gitStatus = await exec('git', [ 'status', '-s' ]);
  if (gitStatus && !argv[ 'ignore-git' ]) {
    console.log('\n=> ERROR: You have unstaged or untracked files, please commit or stash these.\n');
    console.log(gitStatus);
    process.exit(1);
  }

  const branch = argv[ 'branch' ] || 'master';
  const remote = argv[ 'remote' ] || 'origin';
  const increment = argv[ 'increment' ] || 'patch';

  const branchExists = await exec('git', [ 'rev-parse', '--verify', branch ]);

  if (!branchExists) {
    console.log(`\n=> ERROR: Branch "${branch}" doesn't exist.`);
    process.exit(1);
  }

  if (!argv[ 'skip-update' ]) {
    console.log('\n=> Checking out master, pulling down latest changes.');
    await exec('git', [ 'checkout', branch ]);
    await exec('git', [ 'pull', remote, branch ]);
  }

  console.log('\n=> Checking version branch and tag doesn\'t already exist.');
  const target = semver.inc(lernaJson.version, increment);
  const targetBranch = `release/v${target}`;
  const targetBranchExists = await exec('git', [ 'rev-parse', '--verify', targetBranch ]);
  const targetTagExists = await exec('git', [ 'rev-parse', '--verify', `v${target}` ]);
  if (!target || target === '0.0.0') {
    console.log(`ERROR: Invalid increment passed: "${increment}"`);
    process.exit(1);
  }

  if (targetBranchExists || targetTagExists) {
    console.log(`ERROR: The version "v${target}" already exists, please delete ${targetBranch} and tag v${target} to continue`);
    process.exit(1);
  }
  console.log(`  | Current Version: ${lernaJson.version}`);
  console.log(`  | Increment:       ${increment}`);
  console.log(`  | New version:     ${target}\n`);

  await continueWithRelease();

  console.log(`\n=> Checking out new branch "${targetBranch}"`);
  await exec('git', [ 'checkout', '-b', targetBranch ]);
  console.log(`\n=> Running Lerna publish`);
  console.log(
    await exec('lerna', [ 'publish', '--skip-npm', `--cd-version=${increment}`, '--yes' ]),
  );
  console.log('Success! You are now on the branch ready to go.');

  if (!argv[ 'skip-push' ]) {
      const userResponse = argv['push'] ? {continue: true} : await inquirer.prompt({
        type: 'confirm',
        name: 'continue',
        message: `Do you want to push the branch to your remote? (${remote})`,
      });
      if (userResponse[ 'continue' ]) {
        console.log(`Pushing branch "${targetBranch}" and tag "v${target}" to remote "${remote}"`);
        await exec('git', ['push', remote, targetBranch])
        await exec('git', ['push', remote, `v${target}`])

        if (packageJson.repository) {
          console.log(`Your branch has been pushed, click here to open a PR: ${packageJson.repository}/compare/release/v${target}?expand=1`);
        }
      }
  } else {
    console.log(`Your branch ${targetBranch} and tag "v${target}" are available to push.`);
  }
  console.log('Success!');

})();


// On Travis + Master branch
// $ lerna publish --skip-git --npm-tag=next --canary=next
// $ release --next --yes

// On Travis + Master branch + Tag
// $ lerna exec publish (--npm-tag=latest)
// $ release --latest --yes

// For releasing (default)
// - check for changed files (abort if so)
// - checkout master
// - pull from origin (add --remote flag to change this)
// - prompt for version bump (major, minor etc.)
// - checkout release/v{version} that was just chosen (semver.inc(currentVersion, major | minor | patch))
// - $ lerna publish --skip-npm --cd-version=major|minor|patch

// On pull requests
// lerna publish --skip-git --npm-tag=pr-{pr-number} --canary=pr