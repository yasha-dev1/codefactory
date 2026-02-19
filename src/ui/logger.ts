import chalk from 'chalk';

export const logger = {
  info(msg: string) {
    console.log(chalk.blue('ℹ'), msg);
  },

  success(msg: string) {
    console.log(chalk.green('✔'), msg);
  },

  warn(msg: string) {
    console.log(chalk.yellow('⚠'), msg);
  },

  error(msg: string) {
    console.error(chalk.red('✖'), msg);
  },

  debug(msg: string) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('⚙'), chalk.gray(msg));
    }
  },

  header(msg: string) {
    console.log();
    console.log(chalk.bold(msg));
    console.log();
  },

  dim(msg: string) {
    console.log(chalk.dim(msg));
  },

  fileCreated(path: string) {
    console.log(chalk.green('  + Created:'), path);
  },

  fileModified(path: string) {
    console.log(chalk.yellow('  ~ Modified:'), path);
  },
};
