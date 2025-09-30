const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// --- Конфигурация сети и контракта ---
const RPC_URL = "https://testnet.dplabs-internal.com/";  // URL тестнет-ноды
const SEND_ROUTER_ADDRESS = "0xD17512B7EC12880Bd94Eca9d774089fF89805F02";  // Адрес контракта
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
          { name: "tokenType", type: "uint32" },  // Тип токена (0 - нативный, 1 - ERC20)
          { name: "tokenAddress", type: "address" },  // Адрес токена (если ERC20)
        ],
      },
      {
        name: "recipient",
        type: "tuple",
        components: [
          { name: "idSource", type: "string" },  // Источник ID получателя
          { name: "id", type: "string" },  // ID получателя (например, Twitter username)
          { name: "amount", type: "uint256" },  // Сумма перевода
          { name: "nftIds", type: "uint256[]" },  // ID NFT (если применимо)
        ],
      },
    ],
    outputs: [],
  },
];

// --- Загрузка кошельков из файла ---
const wallets = fs.readFileSync(path.join(__dirname, "wallets.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));  // Игнорируем комментарии и пустые строки

if (wallets.length === 0) {
  throw new Error("В файле wallets.txt не найдено приватных ключей!");
}
console.log(`✅ Загружено кошельков: ${wallets.length}`);

// --- Интерактивный ввод данных ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function askQuestion(question, validator = () => true) {
  while (true) {
    const answer = await new Promise((resolve) => rl.question(question, resolve));
    if (validator(answer)) return answer;
    console.log("❌ Некорректный ввод. Попробуйте еще раз.");
  }
}

// --- Генерация случайных Twitter-пользователей ---
function generateRandomTwitterUser() {
  const adjectives = ["happy", "crypto", "web3", "degen", "bullish", "bearish", "smart", "fast", "lucky"];
  const nouns = ["trader", "whale", "ape", "dev", "hodler", "builder", "gmi", "ngmi"];
  const numbers = Math.floor(Math.random() * 1000);
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${numbers}`;
}

// --- Загрузка получателей из файла ---
function loadRecipientsFromFile(filename) {
  try {
    const recipients = fs.readFileSync(path.join(__dirname, filename), "utf-8")
      .split("\n")
      .map((line) => line.trim().replace(/^@/, ""))  // Удаляем @ в начале строки
      .filter((line) => line.length > 0);

    if (recipients.length === 0) {
      console.warn("⚠️ Файл получателей пуст. Используется стандартный получатель yubileyorg");
      return ["yubileyorg"];
    }
    return recipients;
  } catch (error) {
    console.error("❌ Ошибка загрузки файла получателей. Используется стандартный получатель yubileyorg");
    return ["yubileyorg"];
  }
}

// --- Параметры транзакций ---
const tipToken = {
  tokenType: 1,  // 0 = нативный токен, 1 = ERC-20
  tokenAddress: ethers.ZeroAddress,  // Для нативного PHRS (если tokenType=1, укажите адрес ERC-20 токена)
};

const tipRecipientTemplate = {
  idSource: "x",  // Источник ID (фиксированное значение)
  nftIds: [],     // Пустой массив NFT ID (если не используются)
};

// --- Отправка транзакций ---
async function sendTipFromWallet(privateKey, txCount, amountWei, recipients) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(SEND_ROUTER_ADDRESS, PRIMUSLABS_CONTRACT_ABI, signer);

  for (let i = 0; i < txCount; i++) {
    try {
      const recipient = recipients[i % recipients.length];  // Циклическое использование получателей
      console.log(`\n🔹 Подготовка транзакции ${i + 1}/${txCount} для ${recipient}...`);

      // Оценка газа с запасом 20%
      const gasLimit = await contract.tip.estimateGas(
        tipToken,
        { ...tipRecipientTemplate, id: recipient, amount: amountWei },
        { value: amountWei }
      );

      console.log(`🔹 Оценка газа: ${gasLimit.toString()} (с запасом 20%)`);

      // Отправка транзакции
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

      console.log(`✅ Транзакция отправлена с кошелька ${signer.address}:
      - Hash: ${tx.hash}
      - Получатель: ${recipient}
      - Сумма: ${ethers.formatEther(amountWei)} PHRS`);

      // Ожидание подтверждения
      const receipt = await tx.wait();
      console.log(`🎉 Транзакция подтверждена в блоке ${receipt.blockNumber}:
      🔗 https://testnet.pharosscan.xyz/tx/${tx.hash}`);
    } catch (error) {
      console.error(`❌ Ошибка при отправке транзакции ${i + 1}/${txCount}:`, error.shortMessage || error.message);

      if (error.code === "INSUFFICIENT_FUNDS") {
        console.log("💸 Недостаточно средств на балансе. Пропускаем кошелек.");
        break;
      } else if (error.code === "NONCE_EXPIRED" || error.code === "REPLACEMENT_UNDERPRICED") {
        console.log("⚠️ Проблема с nonce или комиссией. Повторяем попытку...");
        i--;  // Повторяем текущую транзакцию
        await new Promise(resolve => setTimeout(resolve, 2000));  // Задержка 2 секунды
      }
    }
  }
}

// --- Главная функция ---
async function main() {
  try {
    console.log("🚀 Запуск скрипта массовой отправки PHRS...");

    // 1. Выбор источника получателей
    const recipientSource = await askQuestion(
      "📥 Источник получателей:\n1. Загрузить из файла (recipients.txt)\n2. Сгенерировать пользователей Twitter \nВыберите (1/2): ",
      (input) => ["1", "2"].includes(input)
    );

    let recipients = [];
    if (recipientSource === "1") {
      recipients = loadRecipientsFromFile("recipients.txt");
      console.log(`✅ Загружено получателей: ${recipients.length}\nСписок: ${recipients.join(", ")}`);
    } else {
      const count = parseInt(await askQuestion(
        "🎲 Сколько случайных получателей сгенерировать? (1-100): ",
        (input) => !isNaN(input) && input > 0 && input <= 100
      ));
      recipients = Array.from({ length: count }, generateRandomTwitterUser);
      console.log(`✅ Сгенерировано получателей: ${recipients.length}\nСписок: ${recipients.join(", ")}`);
    }

    // 2. Параметры транзакций
    const txCount = parseInt(await askQuestion(
      "📦 Сколько транзакций отправить с каждого кошелька? (1-100): ",
      (input) => !isNaN(input) && input >= 1 && input <= 100
    ));

    const amountInput = await askQuestion(
      "💰 Сколько PHRS отправить в одной транзакции? (по умолчанию: 0.001): ",
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
    console.log(`💸 Будет отправлено: ${amountPHRS} PHRS (${amountWei} wei) в каждой транзакции`);

    // 4. Отправка с каждого кошелька
    console.log("\n🔥 Начинаем отправку транзакций...");
    for (const [index, privateKey] of wallets.entries()) {
      try {
        const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(RPC_URL));
        const balance = await wallet.provider.getBalance(wallet.address);

        console.log(`\n📌 Кошелек ${index + 1}/${wallets.length}:
        - Адрес: ${wallet.address}
        - Баланс: ${ethers.formatEther(balance)} PHRS
        - Требуется: ${ethers.formatEther(amountWei * BigInt(txCount))} PHRS`);

        if (balance < amountWei * BigInt(txCount)) {
          console.log("⚠️ Недостаточно средств. Пропускаем кошелек.");
          continue;
        }

        console.log("✈️ Начинаем отправку транзакций...");
        await sendTipFromWallet(privateKey, txCount, amountWei, recipients);
      } catch (error) {
        console.error(`❌ Ошибка инициализации кошелька ${index + 1}:`, error.message);
      }
    }

    console.log("\n🎉 Все транзакции обработаны!");
    rl.close();
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    rl.close();
    process.exit(1);
  }
}

main().catch(console.error);