#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const oldPackageJson = require(__dirname + '/../package.json');
const oldLernaJson = require(__dirname + '/../lerna.json');
const argv = require('yargs').argv;
const inquirer = require('inquirer');
const semver = require('semver');
const exec = require('./exec');
const chalk = require('chalk');

async function continueWithRelease() {
  if (argv[ 'y' ] || argv[ 'yes' ]) {
    return;
  }

  const userResponse = await inquirer.prompt({ type: 'confirm', name: 'continue', message: 'Continue with release?' });
  if (!userResponse[ 'continue' ]) {
    console.log(chalk.red('Aborting release...'));
    process.exit(1);
  }
}

async function releaseNextVersion() {
  const nextArgs = [ 'publish', '--skip-git', '--npm-tag=next', '--canary=next' ];
  console.log(`\n=> ${chalk.green('Preparing to release new "next" tag')}`);
  if (!argv[ 'y' ] && !argv[ 'yes' ]) {
    console.log(await exec('lerna', nextArgs).replace(/\r?\n?[^\r\n]*$/, ''));
    await continueWithRelease();
  }
  console.log(await exec('lerna', [ ...nextArgs, '--yes' ], {}, false));
}

async function releaseLatestVersion() {
  const latestArgs = [ 'exec', 'npm', 'publish' ];
  console.log(`\n=> ${chalk.green('Preparing to release new "latest" tag')}`);
  if (!argv[ 'y' ] && !argv[ 'yes' ] && !argv[ 'ls' ]) {
    console.log(await exec('lerna', [ 'ls' ]));
    await continueWithRelease();
  }

  console.log(await exec('lerna', latestArgs, {}, false));
}

async function releasePullRequestVersion() {
  if (!argv[ 'pull-request' ]) {
    console.log(`\n=> ${chalk.red('No PR number found.')}`);
    process.exit(1);
  }
  console.log(
    await exec('lerna', [ 'publish', '--skip-git', `--npm-tag=${argv[ 'pull-request' ]}`, '--canary=pr', '--yes' ], {} , false)
  );
}

(async function main() {
  console.log(`\n=> ${chalk.yellow('Checking installed versions...')}`);
  console.log(`Node version   ${chalk.green(`${await exec('node', [ '-v' ])}`)}`);
  console.log(`NPM version    ${chalk.green(`v${await exec('npm', [ '-v' ])}`)}`);
  const lerna = await exec('lerna', [ '-v' ]);
  console.log(`Lerna version  v${chalk.green(lerna)}`);

  if (lerna !== oldLernaJson.lerna) {
    console.log(`\nERROR: ${chalk.red('Mismatched Lerna version.')}
 => found: ${lerna}
 => expected: ${oldLernaJson.lerna}
 
 Looks like you may not have run "npm install" in this directory. 
`);
    process.exit(1);
  }

  if (argv[ 'diff' ]) {

    console.log(`\n=> ${chalk.green('Showing changes since last release:')}`);
    console.log(await exec('lerna', [ 'diff' ]));

    await continueWithRelease();
  }

  if (argv[ 'ls' ]) {

    console.log(`\n=> ${chalk.green('Current package versions:')}`);
    console.log(await exec('lerna', [ 'ls' ]));

    await continueWithRelease();
  }

  // Pull request.
  if (argv[ 'pull-request' ]) {
    console.log(`\n=> ${chalk.green('Found a Pull request build.')}`);
    return await releasePullRequestVersion();
  }

  // On Travis + Master branch
  if (argv[ 'next' ]) {
    return await releaseNextVersion();
  }

  // On Travis + Master branch + Tag
  if (argv[ 'latest' ]) {
    return await releaseLatestVersion();
  }

  if (!await exec('lerna', [ 'diff' ])) {
    console.log(chalk.yellow('No updated packages to publish.'));
    process.exit();
  }

  // Default steps.
  const gitStatus = await exec('git', [ 'status', '-s' ]);
  if (gitStatus && !argv[ 'ignore-git' ]) {
    console.log(`\n=> ERROR: ${chalk.red('You have unstaged or untracked files, please commit or stash these.')}\n`);
    console.log(gitStatus);
    process.exit(1);
  }

  const branch = argv[ 'branch' ] || 'master';
  const remote = argv[ 'remote' ] || 'origin';
  const increment = argv[ 'increment' ] || 'patch';

  const branchExists = await exec('git', [ 'rev-parse', '--verify', branch ]);

  if (!branchExists) {
    console.log(`\n=> ${chalk.red(`ERROR: Branch "${branch}" doesn't exist.`)}`);
    process.exit(1);
  }

  if (!argv[ 'skip-update' ]) {
    console.log(`\n=> ${chalk.blue('Checking out master, pulling down latest changes.')}`);
    await exec('git', [ 'checkout', branch ]);
    await exec('git', [ 'pull', remote, branch ]);
  }

  const packageJson = require(__dirname + '/../package.json');
  const lernaJson = require(__dirname + '/../lerna.json');

  console.log(`\n=> ${chalk.green('Checking version branch and tag doesn\'t already exist.')}`);
  const target = semver.inc(lernaJson.version, increment);
  const targetBranch = `release/v${target}`;
  const targetBranchExists = await exec('git', [ 'rev-parse', '--verify', targetBranch ]);
  const targetTagExists = await exec('git', [ 'rev-parse', '--verify', `v${target}` ]);
  if (!target || target === '0.0.0') {
    console.log(`ERROR: Invalid increment passed: "${increment}"`);
    process.exit(1);
  }

  if (targetBranchExists || targetTagExists) {
    console.log(`ERROR: ${chalk.red(`The version "v${target}" already exists, please delete ${targetBranch} and tag v${target} to continue`)}`);
    process.exit(1);
  }
  console.log(`  | Current Version: ${chalk.blue(lernaJson.version)}`);
  console.log(`  | Increment:       ${chalk.yellow(increment)}`);
  console.log(`  | New version:     ${chalk.green(target)}\n`);

  await continueWithRelease();

  console.log(`\n=> ${chalk.green(`Checking out new branch "${targetBranch}"`)}`);
  await exec('git', [ 'checkout', '-b', targetBranch ]);
  console.log(`\n=> ${chalk.green('Running Lerna publish')}`);
  console.log(
    await exec('lerna', [ 'publish', '--skip-npm', `--cd-version=${increment}`, '--yes' ]),
  );
  console.log(chalk.green('Success! You are now on the branch ready to go.'));

  if (!argv[ 'skip-push' ]) {
    const userResponse = argv[ 'push' ] ? { continue: true } : await inquirer.prompt({
      type: 'confirm',
      name: 'continue',
      message: `Do you want to push the branch to your remote? (${remote})`,
    });
    if (userResponse[ 'continue' ]) {
      console.log(chalk.yellow(`Pushing branch "${targetBranch}" and tag "v${target}" to remote "${remote}"`));
      await exec('git', [ 'push', remote, targetBranch ]);
      await exec('git', [ 'push', remote, `v${target}` ]);

      if (packageJson.repository) {
        console.log(`${chalk.green('Your branch has been pushed')}\n click here to open a PR: ${packageJson.repository}/compare/release/v${target}?expand=1`);
      }
    }
  } else {
    console.log(chalk.green(`Your branch ${targetBranch} and tag "v${target}" are available to push.`));
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
// lerna publish --skip-git --npm-tag=pr-{pull-request} --canary=pr