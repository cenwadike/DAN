const fs = require("fs");
const keypair = JSON.parse(fs.readFileSync("/Users/kombi/.config/solana/id.json", "utf8"));
const base64Key = Buffer.from(keypair).toString("base64");
console.log(base64Key);
fs.writeFileSync("temp_key.txt", base64Key);