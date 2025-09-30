# **Pharos Ecosystem Automation Tools**

*A suite of automated tools for interacting with **Pharos Testnet** projects. Simplify smart contract interactions, transaction management, and mass operations across the Pharos ecosystem.*

---

## **✨ Key Features**

✅ **Smart Contract Automation** – Streamlined interactions with Pharos contracts
✅ **Testnet Transaction Management** – Batch sending, gas optimization, and error handling
✅ **Testing & Deployment Tools** – Scripts for contract testing and deployment
✅ **Wallet & Key Management** – Secure handling of private keys and multi-wallet operations
✅ **Mass Operation Scripts** – Bulk transactions, airdrops, and automated workflows
✅ **Ecosystem Integration** – Pre-configured support for Pharos projects

---

## **🔗 Supported Projects**

| Project       | Description |
|--------------|------------|
| **PrimusLabs** | Tipping & rewards system automation |
| **Open-Fi**   | DeFi operations and financial automation |
| **Bitverse**  | NFT marketplace interaction scripts |
| **Brokex**    | Trading utilities and market analysis |
| **Other Pharos Projects** | Extendable for new ecosystem integrations |

---

## **🛠 Technologies**

- **Ethers.js** – Ethereum & Pharos blockchain interaction
- **Node.js** – Backend logic and script execution
- **JavaScript/TypeScript** – Core development language
- **Web3 Tools** – Additional blockchain utilities

---

## **🚀 Getting Started**

### **1. Clone the Repository**
```bash
git clone https://github.com/karpiyksi/PharosEcosystem-BOT.git
cd PharosEcosystem-BOT
```
2. Install dependencies:
```bash
npm init -y
npm install ethers
```
3. Create required configuration files:

**wallets.txt** - Add your private keys (one per line):
```
154789454sfdf54g...
dfskkjsfdk767dsf...
```
**wallet.txt** - Add target addresses for transfers (one per line) or use these 100k addresses:
```
0xc37bf0c7b3bdfb91d09dfdf5c946142c505a9fa8
0xabeeef3a7900904257ecc98134a248c9edc2a16d
0x4d1aa3918b620e31aa29862a4eefa4327776d6e4
```
**recipients.txt** - Add Twitter accounts to send tips:
```
vitalik
elonmusk
```
## 🎯 Usage

Run the bot:
```bash
node PrimuslabsSendTipEN.js
```
