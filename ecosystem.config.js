module.exports = {
  apps: [{
    name: 'helpdesk',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/home/ubuntu/helpdesk',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
