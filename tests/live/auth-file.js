const path = require("node:path");

// The saved GitHub session. .gitignore covers this folder.
const AUTH_FILE = path.resolve(__dirname, "../../.auth/github.json");

module.exports = { AUTH_FILE };
