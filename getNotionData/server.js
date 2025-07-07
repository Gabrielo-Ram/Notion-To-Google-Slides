const path = require("path");
const express = require("express");
const app = express();
const { Client } = require("@notionhq/client");
const { Parser } = require("json2csv");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

//Notion Configuration and Setup
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;
if (!NOTION_API_KEY || !databaseId) {
  throw new Error("Notion API Key or DatabaseId not set");
}
const notion = new Client({ auth: process.env.NOTION_API_KEY });

//Port
const port = process.env.PORT || 8080;

/**
 * A helper function that formats Notion JSON for each page into a
 * more readable format.
 * @param {*} page One page, or row, of the Notion database
 */
function parseNotionPage(page) {
  const getRichText = (field) => field?.rich_text?.[0]?.plain_text ?? "";

  const getTitle = (field) => field?.title?.[0]?.plain_text ?? "";

  const getSelect = (field) => field?.select?.name ?? "";

  const getNumber = (field) =>
    typeof field?.number === "number" ? field.number : 0;

  const getDate = (field) => field?.date?.start ?? "";

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

//Creates a server route to '/api/notion-data' that fetches Notion data and writes
//JSON into a local CSV file
app.get("/api/notion-data", async (req, res) => {
  try {
    //Notion API Call
    const response = await notion.databases.query({
      database_id: databaseId,
    });

    //Formats raw data fetched from Notion into a simpler JSON object.
    const results = response.results.map((page) => parseNotionPage(page));

    //Saves the formatted JSON to a CSV file
    const parser = new Parser();
    const csv = parser.parse(results);
    fs.writeFileSync(path.join(__dirname, "../notion-data.csv"), csv);

    //Returns formated JSON to url
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: `Failed to fetch Notion data with status code 500.`,
    });

    throw new Error(`Error fetching Notion data:\n ${error}`);
  }
});

//Starts the backend server at a specified port
app.listen(port, () => {
  console.log(
    `\nServer started at port: ${port}\nNavigate to: http://localhost:8080/api`
  );
});
