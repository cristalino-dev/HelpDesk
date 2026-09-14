/**
 * pm2 process definition — one file for production and the dev copy (v3.86).
 *
 * scripts/deploy-remote.sh exports APP_NAME and APP_PORT before `pm2 start`,
 * and the app runs from whichever directory this file sits in. With neither
 * set it is production, exactly as before: "helpdesk" on port 3000.
 */
module.exports = {
  apps: [{
    name: process.env.APP_NAME || 'helpdesk',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: Number(process.env.APP_PORT) || 3000
    }
  }]
}
