module.exports = {
  apps: [
    {
      name: 'backend',
      script: './node_modules/.bin/tsx',
      args: 'node_modules/moleculer/bin/moleculer-runner.js --config moleculer.config.ts services/*.ts services/**/*.ts services/**/**/*.ts',
      error_file: './logs/err.log',
      out_file: './logs/out.log'
    }
  ]
};
