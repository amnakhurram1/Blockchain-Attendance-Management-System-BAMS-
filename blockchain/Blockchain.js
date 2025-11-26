// blockchain/Blockchain.js
const Block = require("./Block");
const fs = require("fs");
const path = require("path");

class Blockchain {
  constructor(name, parentChain = null) {
    this.name = name;
    this.parentChain = parentChain;
    this.filePath = path.join(__dirname, "../data", `${name}.json`);
    this.chain = [];
    this.loadOrCreateChain();
  }

  loadOrCreateChain() {
    if (fs.existsSync(this.filePath)) {
      const data = fs.readFileSync(this.filePath, "utf8");
      const rawChain = JSON.parse(data);
      this.chain = rawChain.map((block) => {
        const b = new Block(
          block.index,
          block.timestamp,
          block.transactions,
          block.prevHash,
          block.nonce
        );
        b.hash = block.hash;
        return b;
      });
    } else {
      this.createGenesisBlock();
    }
  }

  createGenesisBlock() {
    const prevHash = this.parentChain
      ? this.parentChain.getLatestBlock().hash
      : "0";
    const genesis = new Block(
      0,
      Date.now(),
      { type: "genesis", name: this.name },
      prevHash
    );
    genesis.mineBlock(); // ← FULLY MINED BEFORE USE
    this.chain = [genesis];
    this.saveChain();
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(transactions) {
    const prevHash = this.getLatestBlock().hash;
    const newBlock = new Block(
      this.chain.length,
      Date.now(),
      transactions,
      prevHash
    );
    newBlock.mineBlock();
    this.chain.push(newBlock);
    this.saveChain();
    return newBlock;
  }

  saveChain() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.chain, null, 2));
  }

  isValidChain() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== current.calculateHash()) return false;
      if (current.prevHash !== previous.hash) return false;
      if (!current.hash.startsWith("0000")) return false;
    }
    return true;
  }

  getLatestData() {
    // Return the latest *non-deleted, non-attendance* transaction.
    // We use this for "current state" of a department/class/student.
    for (let i = this.chain.length - 1; i >= 0; i--) {
      const block = this.chain[i];
      const tx = block.transactions || {};

      // Attendance blocks shouldn't override student/metadata state
      if (tx.action === "attendance") continue;

      // Skip hard-deleted blocks
      if (tx.status === "deleted") continue;

      return tx;
    }
    return null;
  }
}

module.exports = Blockchain;
