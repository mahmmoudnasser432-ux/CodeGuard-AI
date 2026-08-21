require('dotenv/config');
const { env } = require('./apps/api/src/config/env.js');
console.log('Environment values:');
console.log('  SQLSERVER_HOST:', env.SQLSERVER_HOST);
console.log('  SQLSERVER_PORT:', env.SQLSERVER_PORT);
console.log('  SQLSERVER_DATABASE:', env.SQLSERVER_DATABASE);
console.log('  NODE_ENV:', env.NODE_ENV);