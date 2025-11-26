// blockchain/Block.js
const crypto = require("crypto");

class Block {
  constructor(index, timestamp, transactions, prevHash = "", nonce = 0) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions; // e.g., attendance or department data
    this.prevHash = prevHash;
    this.nonce = nonce;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.timestamp +
          JSON.stringify(this.transactions) +
          this.prevHash +
          this.nonce
      )
      .digest("hex");
  }

  mineBlock(difficulty = 4) {
    const target = "0".repeat(difficulty);
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
    console.log(`Block mined: ${this.hash}`);
  }
}

module.exports = Block;
