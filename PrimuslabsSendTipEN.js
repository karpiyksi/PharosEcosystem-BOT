const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// --- Network and Contract Configuration ---
const RPC_URL = "https://testnet.dplabs-internal.com/";  // Testnet node URL
const SEND_ROUTER_ADDRESS = "0xD17512B7EC12880Bd94Eca9d774089fF89805F02";  // Contract address
const PRIMUSLABS_CONTRACT_ABI = [
  {
    type: "function",
    name: "tip",
    stateMutability: "payable",
    inputs: [
      {
        name: "token",
        type: "tuple",
        components: [
          { name: "tokenType", type: "uint32" },  // Token type (0 - native, 1 - ERC20)
          { name: "tokenAddress", type: "address" },  // Token address (if ERC20)
        ],
      },
      {
        name: "recipient",
        type: "tuple",
        components: [
          { name: "idSource", type: "string" },  // Recipient ID source
          { name: "id", type: "string" },  // Recipient ID (e.g., Twitter username)
          { name: "amount", type: "uint256" },  // Transfer amount
          { name: "nftIds", type: "uint256[]" },  // NFT IDs (if applicable)
        ],
      },
    ],
    outputs: [],
  },
];

// --- Load wallets from file ---
const wallets = fs.readFileSync(path.join(__dirname, "wallets.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));  // Ignore comments and empty lines

if (wallets.length === 0) {
  throw new Error("No private keys found in wallets.txt!");
}
console.log(`✅ Loaded wallets: ${wallets.length}`);

// --- Interactive input ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function askQuestion(question, validator = () => true) {
  while (true) {
    const answer = await new Promise((resolve) => rl.question(question, resolve));
    if (validator(answer)) return answer;
    console.log("❌ Invalid input. Please try again.");
  }
}

// --- Generate random Twitter users ---
function generateRandomTwitterUser() {
  const adjectives = ["happy", "crypto", "web3", "degen", "bullish", "bearish", "smart", "fast", "lucky"];
  const nouns = ["trader", "whale", "ape", "dev", "hodler", "builder", "gmi", "ngmi"];
  const numbers = Math.floor(Math.random() * 1000);
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${numbers}`;
}

// --- Load recipients from file ---
function loadRecipientsFromFile(filename) {
  try {
    const recipients = fs.readFileSync(path.join(__dirname, filename), "utf-8")
      .split("\n")
      .map((line) => line.trim().replace(/^@/, ""))  // Remove @ from the beginning of the line
      .filter((line) => line.length > 0);

    if (recipients.length === 0) {
      console.warn("⚠️ Recipients file is empty. Using default recipient yubileyorg");
      return ["yubileyorg"];
    }
    return recipients;
  } catch (error) {
    console.error("❌ Error loading recipients file. Using default recipient yubileyorg");
    return ["yubileyorg"];
  }
}

// --- Transaction parameters ---
const tipToken = {
  tokenType: 1,  // 0 = native token, 1 = ERC-20
  tokenAddress: ethers.ZeroAddress,  // For native PHRS (if tokenType=1, specify ERC-20 token address)
};

const tipRecipientTemplate = {
  idSource: "x",  // Fixed ID source value
  nftIds: [],     // Empty NFT IDs array (if not used)
};

// --- Send transactions ---
async function sendTipFromWallet(privateKey, txCount, amountWei, recipients) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(SEND_ROUTER_ADDRESS, PRIMUSLABS_CONTRACT_ABI, signer);

  for (let i = 0; i < txCount; i++) {
    try {
      const recipient = recipients[i % recipients.length];  // Cycle through recipients
      console.log(`\n🔹 Preparing transaction ${i + 1}/${txCount} for ${recipient}...`);

      // Gas estimation with 20% buffer
      const gasLimit = await contract.tip.estimateGas(
        tipToken,
        { ...tipRecipientTemplate, id: recipient, amount: amountWei },
        { value: amountWei }
      );

      console.log(`🔹 Gas estimate: ${gasLimit.toString()} (with 20% buffer)`);

      // Send transaction
      const tx = await contract.tip(
        tipToken,
        { ...tipRecipientTemplate, id: recipient, amount: amountWei },
        {
          value: amountWei,
          gasLimit: Math.floor(Number(gasLimit) * 1.2),
          maxFeePerGas: (await provider.getFeeData()).maxFeePerGas,
          maxPriorityFeePerGas: (await provider.getFeeData()).maxPriorityFeePerGas,
        }
      );

      console.log(`✅ Transaction sent from wallet ${signer.address}:
      - Hash: ${tx.hash}
      - Recipient: ${recipient}
      - Amount: ${ethers.formatEther(amountWei)} PHRS`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`🎉 Transaction confirmed in block ${receipt.blockNumber}:
      🔗 https://testnet.pharosscan.xyz/tx/${tx.hash}`);
    } catch (error) {
      console.error(`❌ Error sending transaction ${i + 1}/${txCount}:`, error.shortMessage || error.message);

      if (error.code === "INSUFFICIENT_FUNDS") {
        console.log("💸 Insufficient funds. Skipping wallet.");
        break;
      } else if (error.code === "NONCE_EXPIRED" || error.code === "REPLACEMENT_UNDERPRICED") {
        console.log("⚠️ Nonce or fee issue. Retrying...");
        i--;  // Retry current transaction
        await new Promise(resolve => setTimeout(resolve, 2000));  // 2 second delay
      }
    }
  }
}

// --- Main function ---
async function main() {
  try {
    console.log("🚀 Starting PHRS mass send script...");

    // 1. Select recipients source
    const recipientSource = await askQuestion(
      "📥 Recipients source:\n1. Load from file (recipients.txt)\n2. Generate random Twitter users\nChoose (1/2): ",
      (input) => ["1", "2"].includes(input)
    );

    let recipients = [];
    if (recipientSource === "1") {
      recipients = loadRecipientsFromFile("recipients.txt");
      console.log(`✅ Loaded recipients: ${recipients.length}\nList: ${recipients.join(", ")}`);
    } else {
      const count = parseInt(await askQuestion(
        "🎲 How many random recipients to generate? (1-100): ",
        (input) => !isNaN(input) && input > 0 && input <= 100
      ));
      recipients = Array.from({ length: count }, generateRandomTwitterUser);
      console.log(`✅ Generated recipients: ${recipients.length}\nList: ${recipients.join(", ")}`);
    }

    // 2. Transaction parameters
    const txCount = parseInt(await askQuestion(
      "📦 How many transactions to send from each wallet? (1-100): ",
      (input) => !isNaN(input) && input >= 1 && input <= 100
    ));

    const amountInput = await askQuestion(
      "💰 How much PHRS to send per transaction? (default: 0.001): ",
      (input) => {
        if (input.trim() === "") return true;
        const normalizedInput = input.replace(",", ".");
        return !isNaN(normalizedInput) && parseFloat(normalizedInput) > 0;
      }
    );

    const amountPHRS = amountInput.trim() === ""
      ? 0.001
      : parseFloat(amountInput.replace(",", "."));

    const amountWei = ethers.parseEther(amountPHRS.toString());
    console.log(`💸 Will send: ${amountPHRS} PHRS (${amountWei} wei) per transaction`);

    // 3. Send from each wallet
    console.log("\n🔥 Starting transaction sending...");
    for (const [index, privateKey] of wallets.entries()) {
      try {
        const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(RPC_URL));
        const balance = await wallet.provider.getBalance(wallet.address);

        console.log(`\n📌 Wallet ${index + 1}/${wallets.length}:
        - Address: ${wallet.address}
        - Balance: ${ethers.formatEther(balance)} PHRS
        - Required: ${ethers.formatEther(amountWei * BigInt(txCount))} PHRS`);

        if (balance < amountWei * BigInt(txCount)) {
          console.log("⚠️ Insufficient funds. Skipping wallet.");
          continue;
        }

        console.log("✈️ Starting transaction sending...");
        await sendTipFromWallet(privateKey, txCount, amountWei, recipients);
      } catch (error) {
        console.error(`❌ Error initializing wallet ${index + 1}:`, error.message);
      }
    }

    console.log("\n🎉 All transactions processed!");
    rl.close();
  } catch (error) {
    console.error("❌ Critical error:", error);
    rl.close();
    process.exit(1);
  }
}

main().catch(console.error);