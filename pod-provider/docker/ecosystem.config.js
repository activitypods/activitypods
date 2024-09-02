module.exports = {
  apps: [
    {
      name: 'backend',
      script: './node_modules/.bin/moleculer-runner',
      args: '--repl services/*.js services/**/*.js',
      error_file: './logs/err.log',
      out_file: './logs/out.log'
    }
  ]
};
