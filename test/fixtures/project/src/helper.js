const { UserService } = require('./user');
const normalize = name => name.trim();
module.exports = { normalize, UserService };
// Parsing this file must never execute its statements.
throw new Error('This project must never be executed by the analyzer');