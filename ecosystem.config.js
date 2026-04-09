module.exports = {
  apps: [{
    name: 'helpdesk',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: 'C:\\helpdesk',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
