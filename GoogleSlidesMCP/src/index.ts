/**
 * This project is a custom-made MCP Server that takes in data and creates
 * a comprehensive Google Slides presentation using the Google Slides API.
 * An LLM will use the NotionMCP to retrieve data from a Notion database and send
 * that data to this MCP server to create a pitch deck. The only thing this server
 * will return is a string, the presentation ID.
 */

import process, { title } from "process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client } from "@notionhq/client";
import { initiateSlides } from "./createPresentation.js";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { CompanyData } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

//Notion Configuration and Setup
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;
if (!NOTION_API_KEY || !databaseId) {
  throw new Error("Notion API Key or DatabaseId not set");
}

//Create server instance
const server = new McpServer({
  name: "Custom Google Slides MCP Server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

/**
 * A helper function that formats Notion JSON for each page into a
 * more readable format.
 * @param {*} page One page, or row, of the Notion database
 */
function parseNotionPage(page: any) {
  const getRichText = (field: any) => field?.rich_text?.[0]?.plain_text ?? "";

  const getTitle = (field: any) => field?.title?.[0]?.plain_text ?? "";

  const getSelect = (field: any) => field?.select?.name ?? "";

  const getNumber = (field: any) =>
    typeof field?.number === "number" ? field.number : 0;

  const getDate = (field: any) => field?.date?.start ?? "";

  const props = page.properties;

  return {
    companyName: getTitle(props["Company Name"]),
    location: getRichText(props["Location"]),
    foundedYear: getNumber(props["Founded Year"]),
    arr: getNumber(props["ARR"]),
    industry: getSelect(props["Industry"]),
    burnRate: getNumber(props["Burn Rate"]),
    exitStrategy: getSelect(props["Exit Strategy"]),
    dealStatus: getSelect(props["Deal Status"]),
    fundingStage: getSelect(props["Funding Stage"]),
    investmentAmount: getNumber(props["Investment Amount"]),
    investmentDate: getDate(props["Investment Date"]),
    keyMetrics: getRichText(props["Key Metrics"]),
    // Optional: presentationId is not in Notion data, add later
  };
}

//TESTING: An echo tool call
server.tool(
  "echo",
  "Echo text from the user",
  {
    message: z.string().describe("Any user query"),
  },
  async ({ message }) => {
    try {
      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      };
    } catch (error) {
      console.error("Error running the 'echo' tool in MCP Server");
      return {
        content: [
          {
            type: "text",
            text: "There was an error running the 'echo' tool",
          },
        ],
      };
    }
  }
);

// const fetchNotionToolDescription = `This is a tool that fetches Notion data using the Notion API and returns a formatted JSON object with all the pages in the Notion database.
// `;

// server.tool("fetch-Notion-data", fetchNotionToolDescription, {}, async () => {
//   try {
//     //Query database using Notion API
//     const notion = new Client({ auth: process.env.NOTION_API_KEY });
//     const response = await notion.databases.query({
//       database_id: databaseId,
//     });

//     //Formats raw data fetched from Notion into a simpler, more readable JSON object.
//     const results = response.results.map((page) => parseNotionPage(page));

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(results),
//         },
//       ],
//     };
//   } catch (error) {
//     return {
//       content: [
//         {
//           type: "text",
//           text: `There was in error in server tool: \n${error}`,
//         },
//       ],
//     };
//   }
// });

const readCompanyDataToolDescription = `This tool fetches data from a Notion database of companies, formats the resulting JSON into a readable format, and extracts information specific to one row from the database.
This tool MUST be called before create-presentation. It returns all the necessary data to generate a Google Slides presentation.
The user must specify the name of one company. If unclear, ask the user which company they want to create a presentation for. A user can only create a presentation for ONE company. 

The output of this tool fit the following type structure:
{
  companyName: string;
  location: string;
  foundedYear: number;
  arr: number;
  industry: string;
  burnRate: number;
  exitStrategy: string;
  dealStatus: string;
  fundingStage: string;
  investmentAmount: number;
  investmentDate: string;
  keyMetrics: string;
  presentationId?: string;
};`;

server.tool(
  "extract-company-data",
  readCompanyDataToolDescription,
  {
    companyName: z
      .string()
      .describe(
        "The name of the company the user wants to create a Google Slides presentation for."
      ),
  },
  async ({ companyName }) => {
    try {
      //Query database using Notion API
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
      const response = await notion.databases.query({
        database_id: databaseId,
      });

      //Formats raw data fetched from Notion into a simpler, more readable JSON object.
      const results = response.results.map((page) => parseNotionPage(page));
      const company = results.find(
        (row: any) =>
          row.companyName?.trim().toLowerCase() ===
          companyName.trim().toLowerCase()
      );

      if (!company) {
        return {
          content: [
            {
              type: "text",
              text: `No company found with the name ${companyName}`,
            },
          ],
        };
      }

      //Returns the extracted data
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(company),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `An error occured while extracting company data: \n${error}`,
          },
        ],
      };
    }
  }
);

const createPresentationToolDescription = `A tool used to create and style a Google Slides presentation into the user's account. 
You must call 'extract-company-data' before running this tool.
This tool creates ONE presentation for ONE set of company data. 

This tool's only paramater is a JSON object that fits the following type shape:
{
  companyName: string;
  location: string;
  foundedYear: number;
  arr: number;
  industry: string;
  burnRate: number;
  exitStrategy: string;
  dealStatus: string;
  fundingStage: string;
  investmentAmount: number;
  investmentDate: string;
  keyMetrics: string;
  presentationId?: string;
};
  
You must pass input into this tool with the format described above.
Replace the value for each key with appropriate data from the user or from another source specified by the user.`;

//Registers a tool that creates a Google Slides presentation based on data recieved.
server.tool(
  "create-presentation",
  createPresentationToolDescription,
  {
    data: z.object({
      companyName: z.string().describe("The full name of the company"),
      location: z.string().describe("Where the company is located"),
      foundedYear: z.number().describe("The year the company was founded"),
      arr: z
        .number()
        .describe("The ARR, or Annual Recurring Revenue, of the company"),
      industry: z
        .string()
        .describe("The industry the company is in (e.g. Fintech"),
      burnRate: z.number().describe("The burn rate of the company"),
      exitStrategy: z
        .string()
        .describe("The exit strategy of the company (e.g. IPO)"),
      dealStatus: z
        .string()
        .describe("The deal status of the company (e.g. Due Diligence"),
      fundingStage: z
        .string()
        .describe("The funding stage of the company (e.g. Series C)"),
      investmentAmount: z
        .number()
        .describe("The amount invested into the company"),
      investmentDate: z
        .string()
        .describe("The date in which this company was invested in"),
      keyMetrics: z
        .string()
        .describe(
          "A general string that contains important miscellaneous notes for the company"
        ),
    }),
  },
  async ({ data }) => {
    //Validates input
    if (!data) {
      throw new Error("Missing or invalid input data for create-presentation");
    }

    try {
      await initiateSlides(data);

      return {
        content: [
          {
            type: "text",
            text: "Pitch Deck created succesfully. Check your root Google Drives Folder!",
          } as { [x: string]: unknown; type: "text"; text: string },
        ],
      };
    } catch (error) {
      console.error("Error parsing Notion data: ", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to parse Notion data\n${error}`,
          } as { [x: string]: unknown; type: "text"; text: string },
        ],
      };
    }
  }
);

//Main function used to test MCPServer
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("\nGoogle Slides MCP Server running on stdio...");
}

main().catch((error) => {
  console.error("Fatal error in main(): ", error);
  process.exit(1);
});
