# Project: Testing Google Slides MCP

## General Instuctions:

The user will ask to create Google Slides Presentations for specific companies based on a Notion database. The GoogleSlidesMCP server contains tools:

- Fetch data from Notion and save it locally in a CSV file
- Extract data from **one** specific company in the csv file
- Create a presentation based on the extracted data.

**The following must be true** before you create a Google Slides Presentation when the user asks:

1. 'notion-data.csv' must exist. If it does not not, run the tool 'fetch-Notion-data' before continuing.
2. You must know which specific company the user wants to create a presentation for. The user can only create a presentation for ONE company. If the user does not specify which company they want to create a presentation for, prompt them for the answer.

Only when these conditions are met can you run create-presentation.

Be sure to **show the user what you send to the create-presentation tool and everything the tool responds with**.
