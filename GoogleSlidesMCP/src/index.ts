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
import { addCustomSlide, initiateSlides } from "./createPresentation.js";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { parse } from "csv-parse";
import fs from "fs";
// import { CompanyData } from "./types.js";
// import { jsonDescription } from "zod-to-json-schema";

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

const fetchNotionToolDescription = `This is a tool that fetches Notion data from a database using the Notion API and has two outputs:
- The tool itself returns a formatted JSON string of the Notion database.
- Writes this JSON object into a CSV file that is saved in the root project directory.
`;

server.tool("fetch-Notion-data", fetchNotionToolDescription, {}, async () => {
  try {
    //Query database using Notion API
    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    const response = await notion.databases.query({
      database_id: databaseId,
    });

    //Calls the Express endpoint that fetches the Notion data
    const res = await fetch("http://localhost:8080/api/notion-data");
    const results = await await res.json();

    if (!results) {
      throw new Error("Could not fetch data from local backend.");
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `There was in error in fetch-Notion-data: \n${error}`,
        },
      ],
    };
  }
});

const extractCompanyDataToolDescription = `This tool extracts data from a specific company from the local CSV file.
If a local CSV file in the root project directory called 'notion-data.csv' does not exist, please call fetch-Notion-data BEFORE running this tool.
This tool MUST be called before create-presentation. It returns all the necessary data to generate a Google Slides presentation.
The user must specify the name of one company. If unclear, ask the user which company they want to create a presentation for. A user can only create a presentation for ONE company. 

The output of this tool will fit the following type structure:
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

The output of this tool will serve as the input for create-presentation.`;

server.tool(
  "extract-company-data",
  extractCompanyDataToolDescription,
  {
    companyName: z
      .string()
      .describe("The name of the company who's data we want to extract."),
  },
  async ({ companyName }) => {
    try {
      const pathToCSV = path.resolve(__dirname, "../../notion-data.csv");

      const company = await new Promise<Record<string, any> | null>(
        (resolve, reject) => {
          const stream = fs
            .createReadStream(pathToCSV)
            .pipe(parse({ columns: true, trim: true }));

          stream.on("data", (row) => {
            if (
              row.companyName &&
              row.companyName.trim().toLowerCase() ===
                companyName.trim().toLowerCase()
            ) {
              stream.destroy(); // stop the stream once a match is found resolve(row);
              resolve(row);
            }
          });

          stream.on("end", () => resolve(null)); // no match found
          stream.on("error", reject); // on error
        }
      );

      if (!company) {
        return {
          content: [
            {
              type: "text",
              text: `No company found with the name "${companyName}"`,
            },
          ],
        };
      }

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
            text: `An error occurred while extracting company data:\n${
              (error as Error).message
            }`,
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
Replace the value for each key with appropriate data from the user or from another source specified by the user.

This tool will return a string representing the presentationId for the created presentation.
This value will be important if the user decides to add a custom slide using
the addCustomSlide() server tool. Remember this data point.`;

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
      const presentationId = await initiateSlides(data);

      return {
        content: [
          {
            type: "text",
            text: `Presentation ID: ${presentationId}`,
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

const addCustomSlideToolDescription = `This tool allows the user to create a custom slide based on their input.
You MUST call extract-company-data before you run this tool. The output of extract-company-data will serve as the input for this tool.

This tool's parameters are the following: 
- A custom title for this new slide you create. Make up your own title.
- A paragraph you compose based on the user's request. You must use the data extracted from extract-company-data as context for the writing you produce. 
- The presentationID for the most recent presentation you've created. This is a string value.

You DO NOT NEED to create a new presentation when you run this tool. Simply retrieve the presentationID that was returned when you first ran the create-presentation tool.`;

server.tool(
  "add-custom-slide",
  addCustomSlideToolDescription,
  {
    slideTitle: z.string().describe("Your title for this custom-made slide"),
    slideContent: z
      .string()
      .describe("The content made specifically for this slide by the LLM."),
    presentationId: z
      .string()
      .describe(
        "The presentationID for the most recently created Google Slides presentation."
      ),
  },
  async ({ slideTitle, slideContent, presentationId }) => {
    try {
      await addCustomSlide(slideTitle, slideContent, presentationId);

      return {
        content: [
          {
            type: "text",
            text: `Succesfully created a new slide at: ${presentationId}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `There was an error creating a custom slide:\n${error}`,
          },
        ],
      };
    }
  }
);

//Main function used to test MCPServer
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Slides MCP Server running on stdio...");
}

main().catch((error) => {
  console.error("Fatal error in main(): ", error);
  process.exit(1);
});
