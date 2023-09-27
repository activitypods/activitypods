module.exports = {
  apps: [
    {
      name: 'middleware',
      script: './node_modules/.bin/moleculer-runner',
      args: '--repl services/*.service.js apps/*.app.js',
      error_file: './logs/err.log',
      out_file: './logs/out.log'
    }
  ]
};
