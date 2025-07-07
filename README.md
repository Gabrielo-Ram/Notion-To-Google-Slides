# Notion Data -> Google Slides Presentations using MCP

This project is leverages **Model Context Protocol (MCP) Servers** and is designed to create dynamic pitch decks from **Notion database entries** using the **Google Slides API**. The server connects with an LLM (via an MCP client) that can:

- Fetch and format data from a Notion database
- Extract company data from a local CSV
- Create full Google Slides presentations
- Add custom slides to an existing presentation

---

**There are 3 moving parts in this project**

```
project-root/
├──getNotionData/
|   ├── server.js       # Express backend that locally writes Notion data into a CSV file
├── GoogleSlidesMCP/
|   ├── src/
|   |   ├──createPresentation.ts    # Logic for creating/styling Google Slides presentations
|   |   ├──index.ts                 # Entry point for MCP Server!
|   |   ├──types.ts                 # A file with specified types
├── mcpClient/
|   ├──index.ts                     # Entry point for MCP Client!
├── notion-data.csv                # Generated CSV of Notion data (from getNotionData)
├── .env                           # Stores API keys and config
└── README.md
```

## The express backend, custom-made MCP server, and custom-made MCP client are each seperated into distinct directories.

## Google Slides MCP

### ✅ `fetch-Notion-data`

- Queries a Notion database using the Notion API
- Also calls a local Express backend (`/api/notion-data`) to transform data
- Saves the data to `notion-data.csv` in the project root
- Returns formatted Notion data to the LLM

### ✅ `extract-company-data`

- Reads `notion-data.csv` to extract information about a single company
- Returns a structured object compatible with the `create-presentation` tool
- Must be run **before** `create-presentation` or `add-custom-slide`

### ✅ `create-presentation`

- Generates a Google Slides presentation from extracted company data
- Uses the `initiateSlides()` function internally
- Returns the `presentationId`, which must be remembered by the LLM for later use

### ✅ `add-custom-slide`

- Appends a custom slide to an existing Google Slides presentation
- Requires:
  - A custom slide title
  - Slide body content (written by the LLM using context from the company)
  - The `presentationId` from `create-presentation`
- Uses the `addCustomSlide()` helper internally

---

## mcpClient (LLM Interface)

This is a custom-built **MCP Client** that connects a local MCP server to **Google Gemini (via the GenAI SDK)** and enables live CLI-based conversations with an LLM. It converts the MCP server's tools into Gemini-compatible function calls and supports natural language queries from the user.

### Features

- 🔌 Connects to one or more MCP servers over `stdio`
- 🤖 Passes tools from the MCP server to Gemini using `mcpToTool()`
- 🧠 Maintains full chat history between user and Gemini
- 💬 Interactive CLI lets you query Gemini directly
- 🔍 Handles LLM errors, invalid outputs, and session cleanup

---

## Express Backend (Notion Data Fetcher)

This is a lightweight Express server that fetches structured company data from a Notion database, formats it into a JSON array, and writes that data into a local CSV file. It exposes a single API route that powers the rest of the MCP ecosystem.

### Features

- Fetches raw data from a Notion database
- Parses and formats structured JSON from Notion properties
- Converts the data into a CSV file (`notion-data.csv`)
- Serves the cleaned JSON at `/api/notion-data`

---

## Prerequisites

1. **Node.js** v18+
2. **Google Cloud project** with:
   - Slides API enabled
   - OAuth 2.0 Client Credentials
3. **Notion Integration** with:
   - API token
   - Shared access to the relevant database

---

## Usage (Local CLI)

### Create a `.env` file in the root directory with the following:

```env
NOTION_API_KEY=your_notion_secret
NOTION_DATABASE_ID=your_database_id
GOOGLE_PRIVATE_KEY="your_private_key_with_linebreaks"
PORT=your_custom_port (default port set to 8080 if not set)
```

### Run the server via the MCP client using:

```bash
node ./build/index.js ./build/server.js
```

In the MCP client, you can then interact with the LLM like so:

```
Query: Can you create a pitch deck for NeuroLearn AI?

Query: Add a custom slide titled "Market Trends" that explains why their AI product is timely.
```

---

## Testing Locally

Make sure the following are working:

- ✅ Express server on `localhost:8080` returns `/api/notion-data`
- ✅ CSV file is generated after `fetch-Notion-data`
- ✅ LLM is connected to MCP server without errors
- ✅ Google Slides API credentials are valid

---

## Author

Built by [Gabe Ramirez](https://github.com/gabrielramirez)  
Project uses [Model Context Protocol SDK](https://github.com/modelcontext/protocol) and [Google GenAI SDK](https://github.com/google/generative-ai-js)

---
