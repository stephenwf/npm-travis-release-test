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


module.exports = exec;