import { GoogleGenAI, Content, mcpToTool, CallableTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

class MCPClient {
  private ai: GoogleGenAI;
  private clients: Client[] = [];
  private transports: StdioClientTransport[] = [];
  private tools: CallableTool[] = [];
  private messages: Content[] = [];
  //private mcp: Client;
  //   private transport: StdioClientTransport | null = null;
  //   private callableTool: CallableTool | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    //this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  //Server Connection Management Function
  async connectToServer(serverScriptPath: string) {
    try {
      const client = new Client({ name: "mcp-client-cli", version: "1.0.0" });

      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }

      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      //Initiates the stdio transport connection between the server and the client.
      const transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });

      await client.connect(transport);

      //Converts MCP client to a Gemini-compatible tool
      const tool = mcpToTool(client);

      this.tools.push(tool);
      this.clients.push(client);
      this.transports.push(transport);

      console.log("Connected to server with tools...\n");
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  /**
   * Process the user's queries and sends the query to the Gemini
   * @param {string} query The user query
   */
  async processQuery(query: string) {
    const messages = "";

    //Add a prompt that enhances the user's query.
    const prop = "";

    //Push user's message to chat history
    this.messages.push({
      role: "user",
      parts: [{ text: query }],
    });

    //Prompt the model and extract its response as text
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: this.messages,
      config: {
        tools: this.tools,
      },
    });
    const reply = response.text;

    //Push model's response to chat history
    this.messages.push({
      role: "model",
      parts: [{ text: reply }],
    });

    return reply;
  }

  /**
   * This function creates a CLI interface that allows the user to
   * keep a conversing with the LLM.
   */
  async chatLoop() {
    //Initiates std chat connection
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    //Create the CLI interface
    try {
      console.log("MCP Client Started!");
      console.log("\nType your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }

        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  /**
   * Closes all client sessions
   */
  async cleanup() {
    for (const client of this.clients) {
      await client.close();
    }
  }
}

/**
 * Main function that starts the client
 */
async function main() {
  //Process the script arguments
  if (process.argv.length < 3) {
    console.log("\nUsage: node index.ts <path_to_GoogleSlides_Server>\n");
    return;
  }

  const slidesMCPPath = process.argv[2];
  //const notionMCPPath = process.argv[3];

  //Initiate the MCP Client(s)
  const mcpClient = new MCPClient();
  try {
    console.error("MCP Ecosystem is booting up...");
    await mcpClient.connectToServer(slidesMCPPath);
    //await mcpClient.connectToServer(notionMCPPath);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
