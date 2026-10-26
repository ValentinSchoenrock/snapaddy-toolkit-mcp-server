import { createInterface } from "node:readline";
import { API_KEY_FILE, storeApiKey } from "./api-key-store.js";
import { startServer } from "./server.js";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const readline = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    // Suppress echo of typed characters while keeping the prompt visible.
    (readline as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text) => {
      if (text.includes(question)) process.stderr.write(text);
    };
    readline.question(question, (answer) => {
      process.stderr.write("\n");
      readline.close();
      resolve(answer.trim());
    });
  });
}

async function setApiKey(): Promise<void> {
  const key = await promptHidden("Enter snapAddy API key: ");
  if (!key) {
    console.error("No key entered, nothing stored.");
    process.exitCode = 1;
    return;
  }

  storeApiKey(key);
  console.error(`API key stored in ${API_KEY_FILE}`);
}

export function runCli(command = process.argv[2]): Promise<void> {
  return command === "set-api-key" ? setApiKey() : startServer();
}
