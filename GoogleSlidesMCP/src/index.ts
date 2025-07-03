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
import fs from "fs";
import { object } from "zod/v4";
import { serviceconsumermanagement } from "googleapis/build/src/apis/serviceconsumermanagement/index.js";
import { initiateSlides } from "./createPresentation.js";
import { datafusion_v1beta1 } from "googleapis";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Create server instance
const server = new McpServer({
  name: "Custom Google Slides MCP Server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

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

const fetchNotionToolDescription = `This is a tool that fetches formatted JSON data from a custom-built backend and writes a file called 'notion-data.csv' into the root directory of the project.
`;

server.tool("fetch-Notion-data", fetchNotionToolDescription, {}, async () => {
  try {
    const response = await fetch("http://localhost:8080/api");

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    return {
      content: [
        {
          type: "text",
          text: "Succesfully ran the api endpoint",
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `There was in error in server tool: \n${error}`,
        },
      ],
    };
  }
});

const readCompanyDataToolDescription = `Extract data for a single company from the notion-data.csv file.
This tool MUST be called before create-presentation. It returns all the necessary data to generate a Google Slides presentation.
The user will specify the company name. If the CSV file does not exist, call the tool fetch-Notion-data first to create it.
Use this tool whenever the user wants to generate a presentation for a specific company.

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
      const csvPath = path.join(__dirname, "../../notion-data.csv");

      //Calls 'fetch-Notion-data' if the 'notion-data.csv' doesn't exist
      if (!fs.existsSync(csvPath)) {
        return {
          content: [
            {
              type: "text",
              text: "CSV File not found. Please run 'fetch-Notion-data' first.",
            },
          ],
        };
      }

      //Reads the contents of the csv file and finds the company we want.
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
      });
      const company = records.find(
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

const createPresentationToolDescription = `A build-in-progress tool used to create and style a Google Slides presentation into the user's account. 
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
